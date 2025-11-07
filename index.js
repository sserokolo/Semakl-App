// index.js - Browser-ready version for use with your index.html
// - Uses global React and ReactDOM from CDN
// - No TypeScript, no imports
// - Use with: <script type="text/babel" src="index.js"></script>

/* -------------------------
   CONFIG (update as needed)
   ------------------------- */
const API_KEY = 'AIzaSyD2Vpli3NxLCl5NUXzeONboG1kPAKcOw6s'; // replace if needed
const CLIENT_ID = '734978386471-at57e7fa9bardoqteoef8q53kfnldh6b.apps.googleusercontent.com';
const SPREADSHEET_ID = '16gFKvRSOrF6V6QSInppOZ48SAon315nr4UVONQykcnI';
const ADMIN_EMAILS = ['sserokolo@gmail.com'];
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

const CLIENT_LIST = [
  "Bordeaux","Burgersdorp S School","Church of Christ","Craighead P School","Femane P School",
  "Fobeni H School","Fofoza PS","Hovheni P School","Kgahara P School","Kgolakaleme H School",
  "Khamanyani P School","Khekhutini P School","Khopo P School","Khudu S School","Khujwana P School",
  "Kobjaname P School","Kruger Berries Farm","Leakhale P School","Lekukela","Maake PS",
  "Magaingwana P School","Mageva Sports Centre","Mahlane","Mainganya S School","Maje PS",
  "Makala S School","Malebala P School","Malematsha P","Malubana P School","Malwandla P School",
  "Mamaila P School","Mameriri School","Mamolemane S School","Mankete P School","Mantheding",
  "Mantsha","Maolwe S School","Mapitlula P School","Maroboni PS","Masegela P School",
  "Mathibadifate SS","Matome Modika S School","Matseke H School","Maufota P School","Mavele PS",
  "Mbhekwana S School","Mmakau PS","Mogapene PS","Mohlaba P School","Mohlatlego Machaba",
  "Mokwasela Primary School","Molati","Morutsi P School","Mphakane P School","Namatsabo PS",
  "Napsadi SS","Nare","Ngwana makhutswe H","Nkambako P School","Ntwanano PS",
  "Nyantshiri P School","Pelo ya Kgomo SS","Ponani PS","Ramoba SS","Rhulani P",
  "Rita","Runnymede Comm Library","Sara PS","Sebayeng","Sehonwe P School",
  "Sekgalabyana SS","Sekgopo P School","Sekororo","Senwamokgope PS","Senwamokgope SASSA",
  "Shongani P School","Solomondale","Thabanatshwana P School","Timamogolo PS","Tingwazi PS",
  "Tours PS","Tseana S School","Tshangwane P School"
].sort();

const MAX_PHOTOS = 6;
const MAX_IMAGE_WIDTH = 1024;

/* -------------------------
   Data shape notes (JS only)
   ServiceRecord fields (used across app):
     technicianName, clientName, contactPerson, contactPhone,
     dateTime, gps, startTime, endTime, unitsServiced, serviceType,
     serviceNotes, photos (array of dataURLs or drive URLs), clientSignature,
     clientNameTyped, clientCellTyped, id (IndexedDB), rowIndex (sheet)
   ------------------------- */

/* -------------------------
   IndexedDB helpers
   ------------------------- */
const DB_NAME = 'SemaKL_DB';
const STORE_NAME = 'pendingRecords';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRecordOffline(record) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.add(record);
  return tx.complete;
}

async function getAllPendingRecords() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
}

async function deletePendingRecord(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.delete(id);
  return tx.complete;
}

/* -------------------------
   Helpers: dataURL <-> Blob
   ------------------------- */
function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) throw new Error('Invalid data URL');
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

/* -------------------------
   Google Drive & Sheets functions
   (use window.gapi.client and window.google for auth)
   ------------------------- */
async function findOrCreateFolder(name, parentId) {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const res = await window.gapi.client.drive.files.list({ q, fields: 'files(id, name)' });
  if (res.result.files && res.result.files.length > 0) return res.result.files[0].id;

  const fileMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {})
  };
  const folderRes = await window.gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
  return folderRes.result.id;
}

async function uploadPhotosToDrive(photos, record) {
  if (!photos || photos.length === 0) return [];
  console.log(`Starting upload for ${photos.length} photos...`);
  const clientName = (record.clientName || 'UnknownClient').replace(/\s+/g, '_');
  const date = new Date().toISOString().split('T')[0];
  const folderName = `${clientName}_${date}`;

  const rootFolderId = await findOrCreateFolder('SemaKL_Service_Records');
  const clientFolderId = await findOrCreateFolder(folderName, rootFolderId);

  const token = window.gapi.client.getToken ? window.gapi.client.getToken() : null;
  const accessToken = token ? token.access_token : null;
  if (!accessToken) throw new Error('No access token for Drive upload.');

  const uploadPromises = photos.map(async (photoDataUrl, index) => {
    const blob = dataURLtoBlob(photoDataUrl);
    const fileMetadata = {
      name: `${clientName}_${date}_photo_${index + 1}.jpg`,
      parents: [clientFolderId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    form.append('file', blob);

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ 'Authorization': `Bearer ${accessToken}` }),
      body: form
    });

    const result = await uploadResponse.json();
    if (result.webViewLink) return result.webViewLink;
    // some Drive responses may not include webViewLink immediately; construct a webView link if id present
    if (result.id) return `https://drive.google.com/file/d/${result.id}/view`;
    console.error('Upload error response:', result);
    throw new Error(`Failed to upload photo ${index + 1}`);
  });

  const urls = await Promise.all(uploadPromises);
  console.log('Upload complete. URLs:', urls);
  return urls;
}

/* -------------------------
   Sheets helpers
   ------------------------- */
const SHEET_NAME = 'ServiceRecords';
const SHEET_HEADERS = [
  'DateTime', 'TechnicianName', 'ClientName', 'ContactPerson', 'ContactPhone', 'GPS',
  'StartTime', 'EndTime', 'UnitsServiced', 'ServiceType', 'ServiceNotes',
  'ClientNameTyped', 'ClientCellTyped', 'ClientSignature', 'Photos'
];

function recordToSheetRow(record) {
  return [
    record.dateTime || '',
    record.technicianName || '',
    record.clientName || '',
    record.contactPerson || '',
    record.contactPhone || '',
    record.gps || '',
    record.startTime || '',
    record.endTime || '',
    record.unitsServiced || '',
    record.serviceType || '',
    record.serviceNotes || '',
    record.clientNameTyped || '',
    record.clientCellTyped || '',
    record.clientSignature || '',
    (record.photos || []).join(', ')
  ];
}

async function ensureSheetExists() {
  try {
    const sheetsResponse = await window.gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheets = sheetsResponse.result.sheets || [];
    const sheetExists = sheets.some(s => s.properties && s.properties.title === SHEET_NAME);
    if (!sheetExists) {
      await window.gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }
      });
      await window.gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [SHEET_HEADERS] }
      });
      console.log(`Sheet "${SHEET_NAME}" created with headers.`);
    }
  } catch (err) {
    console.error('Error ensuring sheet exists:', err);
    throw new Error('Could not verify or create the required Google Sheet tab. Check permissions.');
  }
}

async function saveRecordToSheet(record) {
  const range = `${SHEET_NAME}!A1:O1`;
  const values = [ recordToSheetRow(record) ];
  await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values }
  });
  console.log('Save to Google Sheets complete.');
}

async function getAllRecordsFromSheet() {
  const response = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:O`
  });
  const rows = response.result.values || [];
  return rows.map((row, index) => ({
    rowIndex: index + 2,
    dateTime: row[0],
    technicianName: row[1],
    clientName: row[2],
    contactPerson: row[3],
    contactPhone: row[4],
    gps: row[5],
    startTime: row[6],
    endTime: row[7],
    unitsServiced: parseInt(row[8], 10) || 0,
    serviceType: row[9],
    serviceNotes: row[10],
    clientNameTyped: row[11],
    clientCellTyped: row[12],
    clientSignature: row[13],
    photos: row[14] ? row[14].split(', ') : []
  }));
}

async function updateRecordInSheet(record) {
  if (!record.rowIndex) throw new Error('Row index is missing for update.');
  const range = `${SHEET_NAME}!A${record.rowIndex}:O${record.rowIndex}`;
  const values = [ recordToSheetRow(record) ];
  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values }
  });
}

/* -------------------------
   SignaturePad component
   ------------------------- */
const { useState, useEffect, useRef, useCallback } = React;

function SignaturePad({ onSignatureChange, initialSignature }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  function getCoords(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDrawing(e) {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;
    const ev = e.touches ? e.touches[0] : e;
    const { x, y } = getCoords(ev);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }

  function draw(e) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;
    const ev = e.touches ? e.touches[0] : e;
    const { x, y } = getCoords(ev);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDrawing() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.closePath();
    setIsDrawing(false);
    onSignatureChange(canvas.toDataURL('image/png'));
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onSignatureChange(null);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = 600 * (window.devicePixelRatio || 1);
    canvas.height = 300 * (window.devicePixelRatio || 1);
    canvas.style.width = '300px';
    canvas.style.height = '150px';
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (initialSignature) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
      img.src = initialSignature;
    }
  }, [initialSignature]);

  return React.createElement('div', null,
    React.createElement('canvas', {
      ref: canvasRef,
      className: 'signature-pad',
      onMouseDown: (e) => { e.preventDefault(); startDrawing(e); },
      onMouseMove: (e) => { e.preventDefault(); draw(e); },
      onMouseUp: (e) => { e.preventDefault(); stopDrawing(); },
      onMouseLeave: (e) => { e.preventDefault(); stopDrawing(); },
      onTouchStart: (e) => { e.preventDefault(); startDrawing(e.touches[0]); },
      onTouchMove: (e) => { e.preventDefault(); draw(e.touches[0]); },
      onTouchEnd: (e) => { e.preventDefault(); stopDrawing(); }
    }),
    React.createElement('div', { className: 'signature-buttons' },
      React.createElement('button', { type: 'button', className: 'form-button back-button', onClick: clearSignature }, 'Clear')
    )
  );
}

/* -------------------------
   ServiceForm component
   ------------------------- */
function ServiceForm({ onBack, onReview, initialData }) {
  const [formData, setFormData] = useState(Object.assign({}, initialData || {}, { photos: (initialData && initialData.photos) || [] }));
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!formData.dateTime) setFormData(d => ({ ...d, dateTime: new Date().toLocaleString() }));
    if (!formData.gps) {
      setFormData(d => ({ ...d, gps: 'Fetching...' }));
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setFormData(d => ({ ...d, gps: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` })),
          () => setFormData(d => ({ ...d, gps: 'Could not get location' })),
          { enableHighAccuracy: true }
        );
      } else {
        setFormData(d => ({ ...d, gps: 'Geolocation not available' }));
      }
    }
  }, []);

  function handleChange(e) {
    const { name, value, type } = e.target;
    const val = type === 'number' ? (value === '' ? '' : parseInt(value, 10)) : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  }

  function handlePhotoChange(event) {
    if (!event.target.files) return;
    const files = Array.from(event.target.files);
    const currentPhotos = formData.photos || [];
    const remainingSlots = MAX_PHOTOS - currentPhotos.length;
    files.slice(0, remainingSlots).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target.result !== 'string') return;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > MAX_IMAGE_WIDTH) {
            height = (MAX_IMAGE_WIDTH / width) * height;
            width = MAX_IMAGE_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setFormData(prev => ({ ...prev, photos: [...(prev.photos || []), dataUrl] }));
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
    // clear file input so same file can be picked again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removePhoto(index) {
    setFormData(prev => ({ ...prev, photos: (prev.photos || []).filter((_, i) => i !== index) }));
  }

  function handleSignatureChange(sig) {
    setFormData(prev => ({ ...prev, clientSignature: sig }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onReview(formData);
  }

  const photos = formData.photos || [];

  return (
    React.createElement('form', { className: 'service-form component-container', onSubmit: handleSubmit, style: { maxWidth: '600px', margin: '0 auto' } },
      React.createElement('h2', null, 'New Service Record'),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Technician Name'),
        React.createElement('input', { type: 'text', value: formData.technicianName || '', readOnly: true, className: 'modal-readonly-field' })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'clientName' }, 'Client/School Name'),
        React.createElement('select', { id: 'clientName', name: 'clientName', value: formData.clientName || '', onChange: handleChange, required: true },
          React.createElement('option', { value: '', disabled: true }, 'Select a client...'),
          CLIENT_LIST.map(client => React.createElement('option', { key: client, value: client }, client))
        )
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'contactPerson' }, 'Client Contact Person'),
        React.createElement('input', { type: 'text', id: 'contactPerson', name: 'contactPerson', value: formData.contactPerson || '', onChange: handleChange })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'contactPhone' }, 'Client Phone Number'),
        React.createElement('input', { type: 'tel', id: 'contactPhone', name: 'contactPhone', value: formData.contactPhone || '', onChange: handleChange })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Date & Time'),
        React.createElement('input', { type: 'text', value: formData.dateTime || '', readOnly: true, className: 'modal-readonly-field' })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'GPS Coordinates'),
        React.createElement('input', { type: 'text', value: formData.gps || '', readOnly: true, className: 'modal-readonly-field' })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'unitsServiced' }, 'Number of Units Serviced'),
        React.createElement('input', { type: 'number', id: 'unitsServiced', name: 'unitsServiced', value: formData.unitsServiced || '', onChange: handleChange, required: true, min: 1 })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'serviceType' }, 'Type of Service'),
        React.createElement('select', { id: 'serviceType', name: 'serviceType', value: formData.serviceType || '', onChange: handleChange, required: true },
          React.createElement('option', { value: '', disabled: true }, 'Select a service type...'),
          React.createElement('option', null, 'Service & Maintenance'),
          React.createElement('option', null, 'Pumping'),
          React.createElement('option', null, 'Repair'),
          React.createElement('option', null, 'Installation'),
          React.createElement('option', null, 'Inspection')
        )
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'serviceNotes' }, 'Service Notes / Comments'),
        React.createElement('textarea', { id: 'serviceNotes', name: 'serviceNotes', value: formData.serviceNotes || '', onChange: handleChange })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Photos (Before, Challenges, After)'),
        React.createElement('p', { style: { fontSize: '0.9rem', color: '#666', marginTop: '-5px' } }, `Max ${MAX_PHOTOS} photos. They will be compressed automatically.`),
        React.createElement('input', {
          type: 'file',
          accept: 'image/*',
          multiple: true,
          onChange: handlePhotoChange,
          ref: fileInputRef,
          style: { display: 'none' }
        }),
        React.createElement('button', {
          type: 'button',
          className: 'form-button submit-button',
          onClick: () => fileInputRef.current && fileInputRef.current.click(),
          disabled: photos.length >= MAX_PHOTOS
        }, `Add Photos (${photos.length}/${MAX_PHOTOS})`),
        React.createElement('div', { className: 'photo-grid' },
          photos.map((photo, index) =>
            React.createElement('div', { key: index, className: 'photo-thumbnail' },
              React.createElement('img', { src: photo, alt: `Service photo ${index + 1}` }),
              React.createElement('button', { type: 'button', className: 'remove-photo-btn', onClick: () => removePhoto(index) }, '\u00D7')
            )
          )
        )
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'clientNameTyped' }, 'Client Name (typed)'),
        React.createElement('input', { type: 'text', id: 'clientNameTyped', name: 'clientNameTyped', value: formData.clientNameTyped || '', onChange: handleChange, required: true })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'clientCellTyped' }, 'Client Cell Number (typed)'),
        React.createElement('input', { type: 'tel', id: 'clientCellTyped', name: 'clientCellTyped', value: formData.clientCellTyped || '', onChange: handleChange })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Client Signature'),
        React.createElement(SignaturePad, { onSignatureChange: handleSignatureChange, initialSignature: formData.clientSignature || null })
      ),
      React.createElement('div', { className: 'form-buttons' },
        React.createElement('button', { type: 'button', className: 'back-button', onClick: onBack }, 'Back'),
        React.createElement('button', { type: 'submit', className: 'submit-button' }, 'Review Service')
      )
    )
  );
}

/* -------------------------
   ReviewScreen component
   ------------------------- */
function ReviewScreen({ data, onBack, onSubmit }) {
  return React.createElement('div', { className: 'review-screen component-container', style: { maxWidth: '600px', margin: '0 auto' } },
    React.createElement('h2', null, 'Review Service Record'),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Technician:'), ' ', React.createElement('span', { className: 'review-value' }, data.technicianName || '')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Client:'), ' ', React.createElement('span', { className: 'review-value' }, data.clientName || '')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Contact Person:'), ' ', React.createElement('span', { className: 'review-value' }, data.contactPerson || 'N/A')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Contact Phone:'), ' ', React.createElement('span', { className: 'review-value' }, data.contactPhone || 'N/A')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Date & Time:'), ' ', React.createElement('span', { className: 'review-value' }, data.dateTime || '')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'GPS:'), ' ', React.createElement('span', { className: 'review-value' }, data.gps || '')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Units Serviced:'), ' ', React.createElement('span', { className: 'review-value' }, data.unitsServiced || '')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Service Type:'), ' ', React.createElement('span', { className: 'review-value' }, data.serviceType || '')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Service Notes:'), ' ', React.createElement('span', { className: 'review-value notes' }, data.serviceNotes || 'N/A')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Client Name (Typed):'), ' ', React.createElement('span', { className: 'review-value' }, data.clientNameTyped || '')),
    React.createElement('div', { className: 'review-item' }, React.createElement('span', { className: 'review-label' }, 'Client Cell (Typed):'), ' ', React.createElement('span', { className: 'review-value' }, data.clientCellTyped || 'N/A')),
    React.createElement('div', { className: 'review-item' },
      React.createElement('span', { className: 'review-label' }, `Photos (${(data.photos && data.photos.length) || 0}):`),
      React.createElement('div', { className: 'photo-grid' }, (data.photos || []).map((p, i) => React.createElement('div', { key: i, className: 'photo-thumbnail' }, React.createElement('img', { src: p, alt: `Photo ${i+1}` }))))
    ),
    React.createElement('div', { className: 'review-item' },
      React.createElement('span', { className: 'review-label' }, 'Client Signature:'),
      data.clientSignature ? React.createElement('div', { className: 'review-signature' }, React.createElement('img', { src: data.clientSignature, alt: 'Client Signature' })) : React.createElement('span', { className: 'review-value' }, 'Not signed')
    ),
    React.createElement('div', { className: 'form-buttons' },
      React.createElement('button', { type: 'button', className: 'back-button', onClick: onBack }, 'Edit'),
      React.createElement('button', { type: 'button', className: 'final-submit-button', onClick: onSubmit }, 'Submit Record')
    )
  );
}

/* -------------------------
   LoginScreen component
   ------------------------- */
function LoginScreen({ onLogin, loading, error }) {
  const origin = window.location.origin;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(origin).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return React.createElement('div', { className: 'login-container component-container' },
    React.createElement('h2', null, 'Welcome to the SemaKL Service App'),
    React.createElement('p', null, 'Please log in with your Google account to continue.'),
    error && React.createElement('div', { className: 'login-error' }, error),
    React.createElement('button', { className: 'login-button', onClick: onLogin, disabled: loading },
      React.createElement('svg', { viewBox: '0 0 48 48', style: { width: 20, height: 20, marginRight: 8 } },
        React.createElement('path', { fill: '#EA4335', d: 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z' }),
        React.createElement('path', { fill: '#4285F4', d: 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z' }),
        React.createElement('path', { fill: '#FBBC05', d: 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z' }),
        React.createElement('path', { fill: '#34A853', d: 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z' }),
        React.createElement('path', { fill: 'none', d: 'M0 0h48v48H0z' })
      ),
      loading ? 'Initializing...' : 'Sign in with Google'
    ),
    React.createElement('div', { className: 'troubleshooting-box' },
      React.createElement('h3', null, 'Login Configuration Help'),
      React.createElement('p', null, 'If you see a "popup_closed_by_user" or "redirect_uri_mismatch" error, it means the Google API is not configured correctly for this app\'s URL.'),
      React.createElement('h4', null, 'To fix this:'),
      React.createElement('ol', null,
        React.createElement('li', null, 'Go to the Google Cloud Console Credentials page.'),
        React.createElement('li', null, 'Select your project.'),
        React.createElement('li', null, 'Click on the name of your "OAuth 2.0 Client ID".'),
        React.createElement('li', null, React.createElement('strong', null, 'Authorized JavaScript origins'), ' — click "+ ADD URI" and paste the exact URL below.'),
        React.createElement('li', null, React.createElement('strong', null, 'Authorized redirect URIs'), ' — do the same.')
      ),
      React.createElement('div', { className: 'copy-url-box' },
        React.createElement('code', null, origin),
        React.createElement('button', { onClick: handleCopy }, copied ? 'Copied!' : 'Copy')
      )
    )
  );
}

/* -------------------------
   AdminDashboard component
   ------------------------- */
function AdminDashboard({ records, onEditRecord }) {
  if (!records || records.length === 0) {
    return React.createElement('div', { className: 'component-container' }, React.createElement('h2', null, 'Admin Dashboard'), React.createElement('p', null, 'No service records found.'));
  }

  return React.createElement('div', { className: 'admin-dashboard component-container' },
    React.createElement('h2', null, 'Admin Dashboard'),
    React.createElement('div', { className: 'table-container' },
      React.createElement('table', { className: 'admin-table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, 'Date & Time'),
            React.createElement('th', null, 'Client'),
            React.createElement('th', null, 'Technician'),
            React.createElement('th', null, 'Service Type'),
            React.createElement('th', null, 'Units'),
            React.createElement('th', null, 'Actions')
          )
        ),
        React.createElement('tbody', null,
          records.slice().reverse().map(record => React.createElement('tr', { key: record.rowIndex },
            React.createElement('td', null, record.dateTime),
            React.createElement('td', null, record.clientName),
            React.createElement('td', null, record.technicianName),
            React.createElement('td', null, record.serviceType),
            React.createElement('td', null, record.unitsServiced),
            React.createElement('td', { className: 'action-cell' }, React.createElement('button', { className: 'edit-button', onClick: () => onEditRecord(record) }, 'View/Edit'))
          ))
        )
      )
    )
  );
}

/* -------------------------
   EditModal component
   ------------------------- */
function EditModal({ record, onSave, onClose }) {
  const [editableRecord, setEditableRecord] = useState(Object.assign({}, record || {}));

  function handleChange(e) {
    const { name, value, type } = e.target;
    const val = type === 'number' ? (value === '' ? '' : parseInt(value, 10)) : value;
    setEditableRecord(prev => ({ ...prev, [name]: val }));
  }

  function handleSave() {
    onSave(editableRecord);
  }

  return React.createElement('div', { className: 'modal-overlay', onClick: onClose },
    React.createElement('div', { className: 'modal-content', onClick: (e) => e.stopPropagation() },
      React.createElement('h3', null, 'Edit Service Record'),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Date & Time'),
        React.createElement('input', { type: 'text', value: editableRecord.dateTime, className: 'modal-readonly-field', readOnly: true })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Technician Name'),
        React.createElement('input', { type: 'text', value: editableRecord.technicianName, className: 'modal-readonly-field', readOnly: true })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { htmlFor: 'clientName' }, 'Client/School Name'),
        React.createElement('select', { id: 'clientName', name: 'clientName', value: editableRecord.clientName, onChange: handleChange },
          CLIENT_LIST.map(client => React.createElement('option', { key: client, value: client }, client))
        )
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Contact Person'),
        React.createElement('input', { type: 'text', name: 'contactPerson', value: editableRecord.contactPerson || '', onChange: handleChange })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Contact Phone'),
        React.createElement('input', { type: 'tel', name: 'contactPhone', value: editableRecord.contactPhone || '', onChange: handleChange })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Photos'),
        (editableRecord.photos || []).map((photo, i) => React.createElement('a', { href: photo, key: i, target: '_blank', rel: 'noopener noreferrer', className: 'modal-photo-link' }, `View Photo ${i + 1}`)),
        (!editableRecord.photos || editableRecord.photos.length === 0) && React.createElement('p', null, 'No photos uploaded.')
      ),
      React.createElement('div', { className: 'form-buttons' },
        React.createElement('button', { type: 'button', className: 'back-button', onClick: onClose }, 'Cancel'),
        React.createElement('button', { type: 'button', className: 'submit-button', onClick: handleSave }, 'Save Changes')
      )
    )
  );
}

/* -------------------------
   TechnicianView
   ------------------------- */
function TechnicianView({ user, onNewService }) {
  return React.createElement('div', { className: 'main-content' },
    React.createElement('button', { className: 'new-service-button', onClick: onNewService }, 'Start New Service')
  );
}

/* -------------------------
   Main App
   ------------------------- */
function App() {
  const [user, setUser] = useState(null);
  const [gapiReady, setGapiReady] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [currentView, setCurrentView] = useState('main'); // 'main', 'form', 'review'
  const [currentRecord, setCurrentRecord] = useState({ photos: [] });

  const [adminRecords, setAdminRecords] = useState([]);
  const [editingRecord, setEditingRecord] = useState(null);

  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  let tokenClient = null;

  async function checkPendingRecords() {
    const pending = await getAllPendingRecords();
    setPendingSyncCount(pending.length);
  }

  const syncOfflineData = useCallback(async () => {
    if (isSyncing || !navigator.onLine || !gapiReady || !gisReady) return;
    const token = window.gapi.client.getToken ? window.gapi.client.getToken() : null;
    if (!token) return;

    const pending = await getAllPendingRecords();
    if (!pending || pending.length === 0) return;

    setIsSyncing(true);
    console.log(`Syncing ${pending.length} offline records...`);
    for (const record of pending) {
      try {
        if (record.photos && record.photos.length > 0) {
          const driveUrls = await uploadPhotosToDrive(record.photos, record);
          record.photos = driveUrls;
        }
        await saveRecordToSheet(record);
        if (record.id) await deletePendingRecord(record.id);
        console.log(`Record ${record.id} synced successfully.`);
      } catch (err) {
        console.error(`Failed to sync record ${record.id}:`, err);
        // continue to next
      }
    }
    setIsSyncing(false);
    checkPendingRecords();
  }, [gapiReady, gisReady, isSyncing]);

  useEffect(() => {
    // Load GAPI and GIS scripts dynamically
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
      if (window.gapi) {
        try { window.gapi.load('client', () => setGapiReady(true)); } catch (e) { setGapiReady(true); }
      } else {
        setGapiReady(true);
      }
    };
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = () => setGisReady(true);
    document.body.appendChild(gisScript);

    // offline sync
    checkPendingRecords();
    window.addEventListener('online', syncOfflineData);
    return () => window.removeEventListener('online', syncOfflineData);
  }, [syncOfflineData]);

  useEffect(() => {
    if (!gapiReady || !gisReady) return;
    setIsLoading(true);
    // init client
    window.gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
        "https://sheets.googleapis.com/discovery/v1/apis/sheets/v4/rest"
      ]
    }).then(() => {
      // set up token client using global google.accounts.oauth2.initTokenClient
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              setLoginError(`Login Error: ${tokenResponse.error_description || tokenResponse.error}`);
              setIsLoading(false);
              return;
            }
            try {
              const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
              });
              const profile = await profileResponse.json();
              const userRole = ADMIN_EMAILS.includes(profile.email) ? 'admin' : 'technician';
              setUser({ name: profile.name, email: profile.email, picture: profile.picture, role: userRole });
              await ensureSheetExists();
              await syncOfflineData();
            } catch (e) {
              setLoginError('Failed to fetch user profile or initialize sheet.');
            } finally {
              setIsLoading(false);
            }
          }
        });
      } else {
        setLoginError('Google Identity Services not available.');
        setIsLoading(false);
      }
    }).catch(err => {
      console.error('GAPI init error', err);
      setLoginError('GAPI client failed to initialize. Check API Key.');
      setIsLoading(false);
    });
  }, [gapiReady, gisReady, syncOfflineData]);

  function handleLogin() {
    setIsLoading(true);
    setLoginError(null);
    // tokenClient is declared in outer scope; if google object is present request token
    if (window.google && window.google.accounts && window.google.accounts.oauth2 && window.google.accounts.oauth2.initTokenClient) {
      // create a new tokenClient if needed (some environments reload the script)
      tokenClient = tokenClient || window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            setLoginError(`Login Error: ${tokenResponse.error_description || tokenResponse.error}`);
            setIsLoading(false);
            return;
          }
          try {
            const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
            });
            const profile = await profileResponse.json();
            const userRole = ADMIN_EMAILS.includes(profile.email) ? 'admin' : 'technician';
            setUser({ name: profile.name, email: profile.email, picture: profile.picture, role: userRole });
            await ensureSheetExists();
            await syncOfflineData();
          } catch (e) {
            setLoginError('Failed to fetch user profile or initialize sheet.');
          } finally {
            setIsLoading(false);
          }
        }
      });
    }

    // request access token
    try {
      if (tokenClient) {
        const existing = window.gapi && window.gapi.client && window.gapi.client.getToken ? window.gapi.client.getToken() : null;
        if (existing === null) {
          tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          tokenClient.requestAccessToken({ prompt: '' });
        }
      } else {
        setLoginError('Google Authentication is not ready. Please wait and try again.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('tokenClient request error', err);
      setLoginError('Failed to start login. Try again.');
      setIsLoading(false);
    }
  }

  function handleLogout() {
    const token = window.gapi && window.gapi.client && window.gapi.client.getToken ? window.gapi.client.getToken() : null;
    if (token) {
      try {
        window.google.accounts.oauth2.revoke(token.access_token, () => {
          if (window.gapi && window.gapi.client) window.gapi.client.setToken(null);
          setUser(null);
          setCurrentView('main');
        });
      } catch (e) {
        console.error('Logout error', e);
      }
    } else {
      setUser(null);
      setCurrentView('main');
    }
  }

  function startNewService() {
    if (!user) return;
    setCurrentRecord({
      photos: [],
      technicianName: user.name,
      startTime: new Date().toLocaleString()
    });
    setCurrentView('form');
  }

  function handleReview(data) {
    setCurrentRecord(Object.assign({}, data));
    setCurrentView('review');
  }

  async function handleSubmit() {
    const finalRecord = Object.assign({}, currentRecord, { endTime: new Date().toLocaleString() });
    setIsLoading(true);
    try {
      if (navigator.onLine) {
        if (finalRecord.photos && finalRecord.photos.length > 0) {
          const driveUrls = await uploadPhotosToDrive(finalRecord.photos, finalRecord);
          finalRecord.photos = driveUrls;
        }
        await saveRecordToSheet(finalRecord);
        alert('Service record submitted successfully!');
      } else {
        await saveRecordOffline(finalRecord);
        await checkPendingRecords();
        alert('You are offline. Record saved locally and will be synced automatically when you reconnect.');
      }
      setCurrentView('main');
      setCurrentRecord({ photos: [] });
    } catch (err) {
      console.error('Submission failed:', err);
      alert(`Submission failed: ${err && err.message ? err.message : String(err)}. The record has been saved locally for syncing.`);
      await saveRecordOffline(finalRecord);
      await checkPendingRecords();
      setCurrentView('main');
      setCurrentRecord({ photos: [] });
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchAdminRecords() {
    setIsLoading(true);
    try {
      const records = await getAllRecordsFromSheet();
      setAdminRecords(records);
    } catch (e) {
      alert('Failed to load records from Google Sheets.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveAdminEdit(updatedRecord) {
    setIsLoading(true);
    try {
      await updateRecordInSheet(updatedRecord);
      setAdminRecords(prev => prev.map(r => r.rowIndex === updatedRecord.rowIndex ? updatedRecord : r));
      setEditingRecord(null);
      alert('Record updated successfully!');
    } catch (e) {
      alert('Failed to update record.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (user && user.role === 'admin') fetchAdminRecords();
  }, [user]);

  if (!user) {
    return React.createElement(LoginScreen, { onLogin: handleLogin, loading: isLoading || !gapiReady || !gisReady, error: loginError });
  }

  return React.createElement('div', { className: 'app-container' },
    React.createElement('header', { className: 'app-header' },
      React.createElement('h1', null, 'SemaKL Enviro Loo Service App'),
      React.createElement('div', { className: 'header-user-info' },
        React.createElement('span', null, `${user.name} (${user.role})`),
        React.createElement('button', { onClick: handleLogout, className: 'logout-button' }, 'Logout')
      )
    ),
    pendingSyncCount > 0 && React.createElement('div', { className: 'sync-notification' }, isSyncing ? `Syncing ${pendingSyncCount} offline records...` : `${pendingSyncCount} records waiting to sync.`),
    user.role === 'admin' && currentView === 'main' && React.createElement(AdminDashboard, { records: adminRecords, onEditRecord: setEditingRecord }),
    user.role === 'technician' && currentView === 'main' && React.createElement(TechnicianView, { user: user, onNewService: startNewService }),
    currentView === 'form' && React.createElement(ServiceForm, { initialData: currentRecord, onBack: () => setCurrentView('main'), onReview: handleReview }),
    currentView === 'review' && React.createElement(ReviewScreen, { data: currentRecord, onBack: () => setCurrentView('form'), onSubmit: handleSubmit }),
    editingRecord && React.createElement(EditModal, { record: editingRecord, onClose: () => setEditingRecord(null), onSave: handleSaveAdminEdit }),
    isLoading && !loginError && React.createElement('div', { className: 'sync-notification' }, 'Processing...')
  );
}

/* -------------------------
   Service worker registration (PWA)
   ------------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(reg => {
      console.log('ServiceWorker registered with scope:', reg.scope);
    }).catch(err => {
      console.log('ServiceWorker registration failed:', err);
    });
  });
}

/* -------------------------
   Mount the app
   ------------------------- */
const container = document.getElementById('root');
if (container && ReactDOM && ReactDOM.createRoot) {
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(App));
} else if (container && ReactDOM && ReactDOM.render) {
  ReactDOM.render(React.createElement(App), container);
} else {
  console.error('ReactDOM is not available or root element not found.');
}
