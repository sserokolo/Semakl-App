// Fix: Import React and ReactDOM as modules to resolve UMD global errors.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// --- START OF GOOGLE API CONFIGURATION ---
// IMPORTANT: Replace these placeholder values with your own credentials
// from the Google Cloud Console (https://console.cloud.google.com/).
const API_KEY = 'AIzaSyD2Vpli3NxLCl5NUXzeONboG1kPAKcOw6s'; // Replace with your API Key
const CLIENT_ID = '734978386471-at57e7fa9bardoqteoef8q53kfnldh6b.apps.googleusercontent.com'; // Replace with your Client ID
const SPREADSHEET_ID = '16gFKvRSOrF6V6QSInppOZ48SAon315nr4UVONQykcnI'; // Replace with your Google Sheet ID
const ADMIN_EMAILS = ['sserokolo@gmail.com']; // Admin email updated as per request.
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';
// --- END OF GOOGLE API CONFIGURATION ---

const CLIENT_LIST = [
    "Bordeaux", "Burgersdorp S School", "Church of Christ", "Craighead P School", "Femane P School", "Fobeni H School", "Fofoza PS", "Hovheni P School", "Kgahara P School", "Kgolakaleme H School", "Khamanyani P School", "Khekhutini P School", "Khopo P School", "Khudu S School", "Khujwana P School", "Kobjaname P School", "Kruger Berries Farm", "Leakhale P School", "Lekukela", "Maake PS", "Magaingwana P School", "Mageva Sports Centre", "Mahlane", "Mainganya S School", "Maje PS", "Makala S School", "Malebala P School", "Malematsha P", "Malubana P School", "Malwandla P School", "Mamaila P School", "Mameriri School", "Mamolemane S School", "Mankete P School", "Mantheding", "Mantsha", "Maolwe S School", "Mapitlula P School", "Maroboni PS", "Masegela P School", "Mathibadifate SS", "Matome Modika S School", "Matseke H School", "Maufota P School", "Mavele PS", "Mbhekwana S School", "Mmakau PS", "Mogapene PS", "Mohlaba P School", "Mohlatlego Machaba", "Mokwasela Primary School", "Molati", "Morutsi P School", "Mphakane P School", "Namatsabo PS", "Napsadi SS", "Nare", "Ngwana makhutswe H", "Nkambako P School", "Ntwanano PS", "Nyantshiri P School", "Pelo ya Kgomo SS", "Ponani PS", "Ramoba SS", "Rhulani P", "Rita", "Runnymede Comm Library", "Sara PS", "Sebayeng", "Sehonwe P School", "Sekgalabyana SS", "Sekgopo P School", "Sekororo", "Senwamokgope PS", "Senwamokgope SASSA", "Shongani P School", "Solomondale", "Thabanatshwana P School", "Timamogolo PS", "Tingwazi PS", "Tours PS", "Tseana S School", "Tshangwane P School"
].sort();


declare global {
    interface Window {
        gapi: any;
        google: any;
        tokenClient: any;
    }
}

const MAX_PHOTOS = 6;
const MAX_IMAGE_WIDTH = 1024;

interface ServiceRecord {
    technicianName: string;
    clientName: string;
    contactPerson: string;
    contactPhone: string;
    dateTime: string;
    gps: string;
    startTime: string;
    endTime: string;
    unitsServiced: number;
    serviceType: string;
    serviceNotes: string;
    photos: string[];
    clientSignature: string | null;
    clientNameTyped: string;
    clientCellTyped: string;
    id?: number; // For IndexedDB
    rowIndex?: number; // For Google Sheet row
}

interface User {
    name: string;
    email: string;
    picture?: string;
    role: 'technician' | 'admin';
}

const emptyRecord: Partial<ServiceRecord> = {
    photos: [],
};

// --- IndexedDB Helper Functions ---
const DB_NAME = 'SemaKL_DB';
const STORE_NAME = 'pendingRecords';
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
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
};

const saveRecordOffline = async (record: Partial<ServiceRecord>) => {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.add(record);
};

const getAllPendingRecords = async (): Promise<ServiceRecord[]> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result as ServiceRecord[]);
    });
};

const deletePendingRecord = async (id: number) => {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
};


// --- Helper Functions ---
function dataURLtoBlob(dataurl: string): Blob {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error('Invalid data URL');
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

// --- Real API Functions ---

async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
    let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const response = await window.gapi.client.drive.files.list({ q: query, fields: 'files(id, name)' });
    
    if (response.result.files && response.result.files.length > 0) {
        return response.result.files[0].id;
    } else {
        const fileMetadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder',
            ...(parentId && { parents: [parentId] })
        };
        const folderResponse = await window.gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
        return folderResponse.result.id;
    }
}


async function uploadPhotosToDrive(photos: string[], record: Partial<ServiceRecord>): Promise<string[]> {
    console.log(`Starting upload for ${photos.length} photos...`);
    const clientName = record.clientName?.replace(/\s+/g, '_') || 'UnknownClient';
    const date = new Date().toISOString().split('T')[0];
    const folderName = `${clientName}_${date}`;

    const rootFolderId = await findOrCreateFolder('SemaKL_Service_Records');
    const clientFolderId = await findOrCreateFolder(folderName, rootFolderId);
    
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
            headers: new Headers({ 'Authorization': `Bearer ${window.gapi.client.getToken().access_token}` }),
            body: form,
        });
        
        const result = await uploadResponse.json();
        if (result.webViewLink) {
             return result.webViewLink;
        } else {
            console.error('Upload error response:', result);
            throw new Error(`Failed to upload photo ${index + 1}`);
        }
    });

    const urls = await Promise.all(uploadPromises);
    console.log('Upload complete. URLs:', urls);
    return urls;
}

const SHEET_NAME = 'ServiceRecords';
const SHEET_HEADERS = [
    'DateTime', 'TechnicianName', 'ClientName', 'ContactPerson', 'ContactPhone', 'GPS', 'StartTime', 'EndTime', 'UnitsServiced', 'ServiceType', 'ServiceNotes', 'ClientNameTyped', 'ClientCellTyped', 'ClientSignature', 'Photos'
];


const recordToSheetRow = (record: Partial<ServiceRecord>) => [
    record.dateTime, record.technicianName, record.clientName, record.contactPerson, record.contactPhone, record.gps, record.startTime, record.endTime, record.unitsServiced, record.serviceType, record.serviceNotes, record.clientNameTyped, record.clientCellTyped, record.clientSignature, (record.photos || []).join(', ')
];

async function ensureSheetExists(): Promise<void> {
    try {
        const sheetsResponse = await window.gapi.client.sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });

        const sheets = sheetsResponse.result.sheets;
        const sheetExists = sheets.some((sheet: any) => sheet.properties.title === SHEET_NAME);

        if (!sheetExists) {
            console.log(`Sheet "${SHEET_NAME}" not found, creating it...`);
            await window.gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
                },
            });
            await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A1`,
                valueInputOption: 'RAW',
                resource: { values: [SHEET_HEADERS] },
            });
            console.log(`Sheet "${SHEET_NAME}" created with headers.`);
        }
    } catch (error) {
        console.error("Error ensuring sheet exists:", error);
        throw new Error("Could not verify or create the required Google Sheet tab. Please check spreadsheet permissions.");
    }
}


async function saveRecordToSheet(record: Partial<ServiceRecord>): Promise<void> {
    console.log('Saving to Google Sheets:', record);
    const range = `${SHEET_NAME}!A1:O1`;
    const values = [ recordToSheetRow(record) ];

    const body = { values };
    await window.gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: body,
    });
    console.log('Save to Google Sheets complete.');
}

async function getAllRecordsFromSheet(): Promise<ServiceRecord[]> {
    const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2:O`,
    });
    
    const rows = response.result.values || [];
    return rows.map((row: any[], index: number) => ({
        rowIndex: index + 2,
        dateTime: row[0],
        technicianName: row[1],
        clientName: row[2],
        contactPerson: row[3],
        contactPhone: row[4],
        gps: row[5],
        startTime: row[6],
        endTime: row[7],
        unitsServiced: parseInt(row[8], 10),
        serviceType: row[9],
        serviceNotes: row[10],
        clientNameTyped: row[11],
        clientCellTyped: row[12],
        clientSignature: row[13],
        photos: row[14] ? row[14].split(', ') : [],
    }));
}

async function updateRecordInSheet(record: ServiceRecord): Promise<void> {
    if (!record.rowIndex) throw new Error("Row index is missing for update.");
    const range = `${SHEET_NAME}!A${record.rowIndex}:O${record.rowIndex}`;
    const values = [ recordToSheetRow(record) ];

    const body = { values };
    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: body,
    });
}


// Signature Pad Component
const SignaturePad = ({ onSignatureChange, initialSignature }: { onSignatureChange: (dataUrl: string | null) => void, initialSignature: string | null }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    const getCoords = (e: MouseEvent | TouchEvent): { x: number, y: number } => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        if (e instanceof MouseEvent) {
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }
        if (e instanceof TouchEvent && e.touches[0]) {
             return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        }
        return { x: 0, y: 0 };
    };

    const startDrawing = (e: MouseEvent | TouchEvent) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;
        
        const { x, y } = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: MouseEvent | TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoords(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.closePath();
        setIsDrawing(false);
        onSignatureChange(canvas.toDataURL('image/png'));
    };
    
    const clearSignature = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            onSignatureChange(null);
        }
    };
    
    const handleMouseEvent = (handler: (e: React.MouseEvent<HTMLCanvasElement>) => void) => (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        handler(e);
    };
    
    const handleTouchEvent = (handler: (e: React.TouchEvent<HTMLCanvasElement>) => void) => (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        handler(e);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if(initialSignature) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = initialSignature;
        }
    }, [initialSignature]);

    return (
        <div>
            <canvas
                ref={canvasRef}
                width="300"
                height="150"
                className="signature-pad"
                onMouseDown={handleMouseEvent(e => startDrawing(e.nativeEvent))}
                onMouseMove={handleMouseEvent(e => draw(e.nativeEvent))}
                onMouseUp={handleMouseEvent(() => stopDrawing())}
                onMouseLeave={handleMouseEvent(() => stopDrawing())}
                onTouchStart={handleTouchEvent(e => startDrawing(e.nativeEvent))}
                onTouchMove={handleTouchEvent(e => draw(e.nativeEvent))}
                onTouchEnd={handleTouchEvent(() => stopDrawing())}
            />
            <div className="signature-buttons">
                <button type="button" className="form-button back-button" onClick={clearSignature}>Clear</button>
            </div>
        </div>
    );
};

const ServiceForm = ({ onBack, onReview, initialData }: { onBack: () => void, onReview: (data: Partial<ServiceRecord>) => void, initialData: Partial<ServiceRecord> }) => {
    const [formData, setFormData] = useState(initialData);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!formData.dateTime) setFormData(d => ({ ...d, dateTime: new Date().toLocaleString() }));
        if (!formData.gps) {
            setFormData(d => ({ ...d, gps: 'Fetching...' }));
            navigator.geolocation.getCurrentPosition(
                (pos) => setFormData(d => ({...d, gps: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`})),
                () => setFormData(d => ({...d, gps: 'Could not get location'})),
                { enableHighAccuracy: true }
            );
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'number' ? parseInt(value, 10) : value;
        setFormData(prev => ({ ...prev, [name]: val }));
    };

    const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files) return;
        const files = Array.from(event.target.files);
        const currentPhotos = formData.photos || [];
        const remainingSlots = MAX_PHOTOS - currentPhotos.length;
        
        files.slice(0, remainingSlots).forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (typeof e.target?.result !== 'string') return;
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
                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    setFormData(prev => ({...prev, photos: [...(prev.photos || []), dataUrl]}));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    };
    
    const removePhoto = (index: number) => {
        setFormData(prev => ({...prev, photos: (prev.photos || []).filter((_, i) => i !== index)}));
    };

    const handleSignatureChange = (signature: string | null) => {
        setFormData(prev => ({...prev, clientSignature: signature}));
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onReview(formData);
    }
    
    const photos = formData.photos || [];

    return (
        <form className="service-form component-container" onSubmit={handleSubmit} style={{maxWidth: '600px', margin: '0 auto'}}>
            <h2>New Service Record</h2>
            
            <div className="form-group">
                <label>Technician Name</label>
                <input type="text" value={formData.technicianName || ''} readOnly className="modal-readonly-field" />
            </div>

            <div className="form-group">
                <label htmlFor="clientName">Client/School Name</label>
                <select id="clientName" name="clientName" value={formData.clientName || ''} onChange={handleChange} required>
                    <option value="" disabled>Select a client...</option>
                    {CLIENT_LIST.map(client => <option key={client} value={client}>{client}</option>)}
                </select>
            </div>

            <div className="form-group">
                <label htmlFor="contactPerson">Client Contact Person</label>
                <input type="text" id="contactPerson" name="contactPerson" value={formData.contactPerson || ''} onChange={handleChange} />
            </div>
            
            <div className="form-group">
                <label htmlFor="contactPhone">Client Phone Number</label>
                <input type="tel" id="contactPhone" name="contactPhone" value={formData.contactPhone || ''} onChange={handleChange} />
            </div>

            <div className="form-group">
                <label>Date & Time</label>
                <input type="text" value={formData.dateTime || ''} readOnly className="modal-readonly-field" />
            </div>
            
            <div className="form-group">
                <label>GPS Coordinates</label>
                <input type="text" value={formData.gps || ''} readOnly className="modal-readonly-field" />
            </div>

            <div className="form-group">
                <label htmlFor="unitsServiced">Number of Units Serviced</label>
                <input type="number" id="unitsServiced" name="unitsServiced" value={formData.unitsServiced || ''} onChange={handleChange} required min="1" />
            </div>

            <div className="form-group">
                <label htmlFor="serviceType">Type of Service</label>
                <select id="serviceType" name="serviceType" value={formData.serviceType || ''} onChange={handleChange} required>
                    <option value="" disabled>Select a service type...</option>
                    <option>Service & Maintenance</option>
                    <option>Pumping</option>
                    <option>Repair</option>
                    <option>Installation</option>
                    <option>Inspection</option>
                </select>
            </div>
            
            <div className="form-group">
                <label htmlFor="serviceNotes">Service Notes / Comments</label>
                <textarea id="serviceNotes" name="serviceNotes" value={formData.serviceNotes || ''} onChange={handleChange}></textarea>
            </div>
            
            <div className="form-group">
                <label>Photos (Before, Challenges, After)</label>
                <p style={{fontSize: '0.9rem', color: '#666', marginTop: '-5px'}}>Max {MAX_PHOTOS} photos. They will be compressed automatically.</p>
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoChange}
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                />
                <button type="button" className="form-button submit-button" onClick={() => fileInputRef.current?.click()} disabled={photos.length >= MAX_PHOTOS}>
                    Add Photos ({photos.length}/{MAX_PHOTOS})
                </button>
                <div className="photo-grid">
                    {photos.map((photo, index) => (
                        <div key={index} className="photo-thumbnail">
                            <img src={photo} alt={`Service photo ${index + 1}`} />
                            <button type="button" className="remove-photo-btn" onClick={() => removePhoto(index)}>&times;</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="clientNameTyped">Client Name (typed)</label>
                <input type="text" id="clientNameTyped" name="clientNameTyped" value={formData.clientNameTyped || ''} onChange={handleChange} required />
            </div>

            <div className="form-group">
                <label htmlFor="clientCellTyped">Client Cell Number (typed)</label>
                <input type="tel" id="clientCellTyped" name="clientCellTyped" value={formData.clientCellTyped || ''} onChange={handleChange} />
            </div>

            <div className="form-group">
                <label>Client Signature</label>
                <SignaturePad onSignatureChange={handleSignatureChange} initialSignature={formData.clientSignature || null} />
            </div>
            
            <div className="form-buttons">
                <button type="button" className="back-button" onClick={onBack}>Back</button>
                <button type="submit" className="submit-button">Review Service</button>
            </div>
        </form>
    );
};

const ReviewScreen = ({ data, onBack, onSubmit }: { data: Partial<ServiceRecord>, onBack: () => void, onSubmit: () => void }) => {
    return (
        <div className="review-screen component-container" style={{maxWidth: '600px', margin: '0 auto'}}>
            <h2>Review Service Record</h2>
            <div className="review-item"><span className="review-label">Technician:</span> <span className="review-value">{data.technicianName}</span></div>
            <div className="review-item"><span className="review-label">Client:</span> <span className="review-value">{data.clientName}</span></div>
            <div className="review-item"><span className="review-label">Contact Person:</span> <span className="review-value">{data.contactPerson || 'N/A'}</span></div>
            <div className="review-item"><span className="review-label">Contact Phone:</span> <span className="review-value">{data.contactPhone || 'N/A'}</span></div>
            <div className="review-item"><span className="review-label">Date & Time:</span> <span className="review-value">{data.dateTime}</span></div>
            <div className="review-item"><span className="review-label">GPS:</span> <span className="review-value">{data.gps}</span></div>
            <div className="review-item"><span className="review-label">Units Serviced:</span> <span className="review-value">{data.unitsServiced}</span></div>
            <div className="review-item"><span className="review-label">Service Type:</span> <span className="review-value">{data.serviceType}</span></div>
            <div className="review-item"><span className="review-label">Service Notes:</span> <span className="review-value notes">{data.serviceNotes || 'N/A'}</span></div>
            <div className="review-item"><span className="review-label">Client Name (Typed):</span> <span className="review-value">{data.clientNameTyped}</span></div>
            <div className="review-item"><span className="review-label">Client Cell (Typed):</span> <span className="review-value">{data.clientCellTyped || 'N/A'}</span></div>
            <div className="review-item">
                <span className="review-label">Photos ({data.photos?.length || 0}):</span>
                <div className="photo-grid">
                    {(data.photos || []).map((p, i) => <div key={i} className="photo-thumbnail"><img src={p} alt={`Photo ${i+1}`} /></div>)}
                </div>
            </div>
            <div className="review-item">
                <span className="review-label">Client Signature:</span>
                {data.clientSignature ? <div className="review-signature"><img src={data.clientSignature} alt="Client Signature"/></div> : <span className="review-value">Not signed</span>}
            </div>

             <div className="form-buttons">
                <button type="button" className="back-button" onClick={onBack}>Edit</button>
                <button type="button" className="final-submit-button" onClick={onSubmit}>Submit Record</button>
            </div>
        </div>
    );
};


const LoginScreen = ({ onLogin, loading, error }: { onLogin: () => void, loading: boolean, error: string | null }) => {
    const origin = window.location.origin;
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(origin).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="login-container component-container">
            <h2>Welcome to the SemaKL Service App</h2>
            <p>Please log in with your Google account to continue.</p>
             {error && <div className="login-error">{error}</div>}
            <button className="login-button" onClick={onLogin} disabled={loading}>
                <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>
                {loading ? 'Initializing...' : 'Sign in with Google'}
            </button>
             <div className="troubleshooting-box">
                <h3>Login Configuration Help</h3>
                <p>If you see a "popup_closed_by_user" or "redirect_uri_mismatch" error, it means the Google API is not configured correctly for this app's URL.</p>
                <h4>To fix this:</h4>
                <ol>
                    <li>Go to the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console Credentials</a> page.</li>
                    <li>Select your project.</li>
                    <li>Click on the name of your "OAuth 2.0 Client ID".</li>
                    <li>Under <strong>"Authorized JavaScript origins"</strong>, click "+ ADD URI" and paste the exact URL below.</li>
                    <li>Under <strong>"Authorized redirect URIs"</strong>, do the same: click "+ ADD URI" and paste the same URL.</li>
                </ol>
                <div className="copy-url-box">
                    <code>{origin}</code>
                    <button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
                </div>
            </div>
        </div>
    );
};

const AdminDashboard = ({ records, onEditRecord }: { records: ServiceRecord[], onEditRecord: (record: ServiceRecord) => void }) => {
    if (records.length === 0) {
        return <div className="component-container"><h2>Admin Dashboard</h2><p>No service records found.</p></div>;
    }

    return (
        <div className="admin-dashboard component-container">
            <h2>Admin Dashboard</h2>
            <div className="table-container">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Date & Time</th>
                            <th>Client</th>
                            <th>Technician</th>
                            <th>Service Type</th>
                            <th>Units</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {records.slice().reverse().map(record => ( // Show most recent first
                            <tr key={record.rowIndex}>
                                <td>{record.dateTime}</td>
                                <td>{record.clientName}</td>
                                <td>{record.technicianName}</td>
                                <td>{record.serviceType}</td>
                                <td>{record.unitsServiced}</td>
                                <td className="action-cell">
                                    <button className="edit-button" onClick={() => onEditRecord(record)}>View/Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const EditModal = ({ record, onSave, onClose }: { record: ServiceRecord, onSave: (updatedRecord: ServiceRecord) => void, onClose: () => void }) => {
    const [editableRecord, setEditableRecord] = useState(record);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'number' ? parseInt(value, 10) : value;
        setEditableRecord(prev => ({ ...prev, [name]: val }));
    };
    
    const handleSave = () => onSave(editableRecord);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Edit Service Record</h3>
                
                <div className="form-group">
                    <label>Date & Time</label>
                    <input type="text" value={editableRecord.dateTime} className="modal-readonly-field" readOnly />
                </div>
                
                <div className="form-group">
                    <label>Technician Name</label>
                    <input type="text" value={editableRecord.technicianName} className="modal-readonly-field" readOnly />
                </div>

                <div className="form-group">
                    <label htmlFor="clientName">Client/School Name</label>
                    <select id="clientName" name="clientName" value={editableRecord.clientName} onChange={handleChange}>
                         {CLIENT_LIST.map(client => <option key={client} value={client}>{client}</option>)}
                    </select>
                </div>

                <div className="form-group">
                    <label>Contact Person</label>
                    <input type="text" name="contactPerson" value={editableRecord.contactPerson} onChange={handleChange} />
                </div>
                
                <div className="form-group">
                    <label>Contact Phone</label>
                    <input type="tel" name="contactPhone" value={editableRecord.contactPhone} onChange={handleChange} />
                </div>

                <div className="form-group">
                    <label>Photos</label>
                    {(editableRecord.photos || []).map((photo, i) => (
                        <a href={photo} key={i} target="_blank" rel="noopener noreferrer" className="modal-photo-link">View Photo {i + 1}</a>
                    ))}
                    {(!editableRecord.photos || editableRecord.photos.length === 0) && <p>No photos uploaded.</p>}
                </div>

                <div className="form-buttons">
                    <button type="button" className="back-button" onClick={onClose}>Cancel</button>
                    <button type="button" className="submit-button" onClick={handleSave}>Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const TechnicianView = ({ user, onNewService }: { user: User, onNewService: () => void }) => {
    return (
        <div className="main-content">
            <button className="new-service-button" onClick={onNewService}>
                Start New Service
            </button>
        </div>
    );
};

// Main App Component
const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [gapiReady, setGapiReady] = useState(false);
    const [gisReady, setGisReady] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const [currentView, setCurrentView] = useState('main'); // 'main', 'form', 'review'
    const [currentRecord, setCurrentRecord] = useState<Partial<ServiceRecord>>(emptyRecord);
    
    const [adminRecords, setAdminRecords] = useState<ServiceRecord[]>([]);
    const [editingRecord, setEditingRecord] = useState<ServiceRecord | null>(null);

    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    
    let tokenClient: any;

    const checkPendingRecords = async () => {
        const pending = await getAllPendingRecords();
        setPendingSyncCount(pending.length);
    };

    const syncOfflineData = useCallback(async () => {
        if (isSyncing || !navigator.onLine || !gapiReady || !gisReady || !window.gapi.client.getToken()) return;

        const pending = await getAllPendingRecords();
        if (pending.length === 0) return;
        
        setIsSyncing(true);
        console.log(`Syncing ${pending.length} offline records...`);

        for (const record of pending) {
            try {
                if (record.photos && record.photos.length > 0) {
                    const driveUrls = await uploadPhotosToDrive(record.photos, record);
                    record.photos = driveUrls;
                }
                await saveRecordToSheet(record);
                if (record.id) {
                    await deletePendingRecord(record.id);
                }
                 console.log(`Record ${record.id} synced successfully.`);
            } catch (error) {
                console.error(`Failed to sync record ${record.id}:`, error);
                // Don't stop on error, try the next one
            }
        }
        
        setIsSyncing(false);
        checkPendingRecords(); // Update count after sync
    }, [gapiReady, gisReady, isSyncing]);


    useEffect(() => {
        // Load GAPI and GIS scripts
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.async = true;
        gapiScript.defer = true;
        gapiScript.onload = () => window.gapi.load('client', () => setGapiReady(true));
        document.body.appendChild(gapiScript);

        const gisScript = document.createElement('script');
        gisScript.src = 'https://accounts.google.com/gsi/client';
        gisScript.async = true;
        gisScript.defer = true;
        gisScript.onload = () => setGisReady(true);
        document.body.appendChild(gisScript);
        
        // Offline sync handling
        checkPendingRecords();
        window.addEventListener('online', syncOfflineData);
        return () => window.removeEventListener('online', syncOfflineData);

    }, [syncOfflineData]);

    useEffect(() => {
        if (!gapiReady || !gisReady) return;
        
        // Initialize API client
        window.gapi.client.init({ apiKey: API_KEY, discoveryDocs: [
            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
            "https://sheets.googleapis.com/discovery/v1/apis/sheets/v4/rest"
        ]}).then(() => {
             tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: async (tokenResponse: any) => {
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
                        syncOfflineData();
                    } catch(e) {
                         setLoginError('Failed to fetch user profile or initialize sheet.');
                    } finally {
                        setIsLoading(false);
                    }
                },
            });
        }).catch(err => {
            setLoginError('GAPI client failed to initialize. Check API Key.');
            setIsLoading(false);
        });
        
    }, [gapiReady, gisReady, syncOfflineData]);

    const handleLogin = () => {
        setIsLoading(true);
        setLoginError(null);
        if (tokenClient) {
            if (window.gapi.client.getToken() === null) {
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                tokenClient.requestAccessToken({ prompt: '' });
            }
        } else {
            setLoginError("Google Authentication is not ready. Please wait a moment and try again.");
            setIsLoading(false);
        }
    };
    
    const handleLogout = () => {
        const token = window.gapi.client.getToken();
        if (token !== null) {
            window.google.accounts.oauth2.revoke(token.access_token, () => {
                 window.gapi.client.setToken(null);
                 setUser(null);
                 setCurrentView('main');
            });
        }
    };
    
    const startNewService = () => {
        if (!user) return;
        setCurrentRecord({
            ...emptyRecord,
            technicianName: user.name,
            startTime: new Date().toLocaleString(),
        });
        setCurrentView('form');
    };
    
    const handleReview = (data: Partial<ServiceRecord>) => {
        setCurrentRecord(data);
        setCurrentView('review');
    };
    
    const handleSubmit = async () => {
        const finalRecord: Partial<ServiceRecord> = {
            ...currentRecord,
            endTime: new Date().toLocaleString(),
        };
        
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
            setCurrentRecord(emptyRecord);
        } catch(error) {
            console.error("Submission failed:", error);
            alert(`Submission failed: ${error instanceof Error ? error.message : String(error)}. The record has been saved locally for syncing.`);
            await saveRecordOffline(finalRecord);
            await checkPendingRecords();
            setCurrentView('main');
            setCurrentRecord(emptyRecord);
        } finally {
            setIsLoading(false);
        }
    };
    
    const fetchAdminRecords = async () => {
        setIsLoading(true);
        try {
            const records = await getAllRecordsFromSheet();
            setAdminRecords(records);
        } catch (e) {
            alert('Failed to load records from Google Sheets.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSaveAdminEdit = async (updatedRecord: ServiceRecord) => {
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
    };
    
    useEffect(() => {
        if (user?.role === 'admin') {
            fetchAdminRecords();
        }
    }, [user]);

    if (!user) {
        return <LoginScreen onLogin={handleLogin} loading={isLoading || !gapiReady || !gisReady} error={loginError} />;
    }

    return (
        <div className="app-container">
            <header className="app-header">
                <h1>SemaKL Enviro Loo Service App</h1>
                <div className="header-user-info">
                    <span>{user.name} ({user.role})</span>
                    <button onClick={handleLogout} className="logout-button">Logout</button>
                </div>
            </header>

            {pendingSyncCount > 0 && (
                <div className="sync-notification">
                    {isSyncing ? `Syncing ${pendingSyncCount} offline records...` : `${pendingSyncCount} records waiting to sync.`}
                </div>
            )}
            
            {user.role === 'admin' && currentView === 'main' && (
                <AdminDashboard records={adminRecords} onEditRecord={setEditingRecord} />
            )}
            
            {user.role === 'technician' && currentView === 'main' && (
                <TechnicianView user={user} onNewService={startNewService} />
            )}

            {currentView === 'form' && (
                <ServiceForm
                    initialData={currentRecord}
                    onBack={() => setCurrentView('main')}
                    onReview={handleReview}
                />
            )}
            
            {currentView === 'review' && (
                <ReviewScreen
                    data={currentRecord}
                    onBack={() => setCurrentView('form')}
                    onSubmit={handleSubmit}
                />
            )}

            {editingRecord && (
                <EditModal
                    record={editingRecord}
                    onClose={() => setEditingRecord(null)}
                    onSave={handleSaveAdminEdit}
                />
            )}
            
            {isLoading && !loginError && <div className="sync-notification">Processing...</div>}
        </div>
    );
};


// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(error => {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

// --- Mount the app ---
const container = document.getElementById('root');
if (container) {
    // Fix: Use createRoot from the imported ReactDOM module and render using JSX.
    const root = ReactDOM.createRoot(container);
    root.render(<App />);
} else {
    console.error('Failed to find the root element');
}
