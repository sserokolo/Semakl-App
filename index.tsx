// React and ReactDOM are now loaded globally via script tags in index.html
// No imports are needed here.

const { useState, useEffect, useRef, useCallback } = React;

// --- START OF GOOGLE API CONFIGURATION ---
// IMPORTANT: Replace these placeholder values with your own credentials
// from the Google Cloud Console (https://console.cloud.google.com/).
//
// --- Step 1: Create Project & Enable APIs ---
// 1. Create a new project.
// 2. Enable the "Google Drive API" and "Google Sheets API".
//
// --- Step 2: Configure OAuth Consent Screen (Crucial for Login) ---
// 1. Go to "APIs & Services" -> "OAuth consent screen".
// 2. Choose "External" and create the screen.
// 3. **Publishing Status**: It is okay if it's "In production". If it's "Testing", you MUST
//    add test users.
// 4. **Test Users**: While in "Testing" mode, you MUST add the Google accounts
//    of everyone who will use the app (technicians and admins).
//    Click "+ ADD USERS" and add your email (e.g., sserokolo@gmail.com).
//
// --- Step 3: Create Credentials ---
// 1. Go to "APIs & Services" -> "Credentials".
// 2. Create an "API Key". Copy it below.
//    - Restrict this key: Under "Website restrictions", add the URL where your app
//      is running (e.g., http://localhost:3000 and your final deployed URL).
// 3. Create an "OAuth 2.0 Client ID".
//    - Select "Web application".
//    - **Authorized JavaScript origins & Redirect URIs**: You MUST add the exact URL where
//      your app is running to BOTH of these lists. This is the most common cause of login errors.
//      The app will show you the exact URL to copy.
//    - Copy the Client ID below.
//
// --- Step 4: Create Google Sheet ---
// 1. Create a new Google Sheet.
// 2. Get the ID from its URL (the long string between "/d/" and "/edit").
//    Example: .../d/THIS_IS_THE_ID/edit...

const API_KEY = 'AIzaSyD2Vpli3NxLCl5NUXzeONboG1kPAKcOw6s'; // Replace with your API Key
const CLIENT_ID = '734978386471-at57e7fa9bardoqteoef8q53kfnldh6b.apps.googleusercontent.com'; // Replace with your Client ID
const SPREADSHEET_ID = '16gFKvRSOrF6V6QSInppOZ48SAon315nr4UVONQykcnI'; // Replace with your Google Sheet ID

const ADMIN_EMAILS = ['sserokolo@gmail.com']; // Admin email updated as per request.

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

// --- END OF GOOGLE API CONFIGURATION ---

const CLIENT_LIST = [
    "Bordeaux",
    "Burgersdorp S School",
    "Church of Christ",
    "Craighead P School",
    "Femane P School",
    "Fobeni H School",
    "Fofoza PS",
    "Hovheni P School",
    "Kgahara P School",
    "Kgolakaleme H School",
    "Khamanyani P School",
    "Khekhutini P School",
    "Khopo P School",
    "Khudu S School",
    "Khujwana P School",
    "Kobjaname P School",
    "Kruger Berries Farm",
    "Leakhale P School",
    "Lekukela",
    "Maake PS",
    "Magaingwana P School",
    "Mageva Sports Centre",
    "Mahlane",
    "Mainganya S School",
    "Maje PS",
    "Makala S School",
    "Malebala P School",
    "Malematsha P",
    "Malubana P School",
    "Malwandla P School",
    "Mamaila P School",
    "Mameriri School",
    "Mamolemane S School",
    "Mankete P School",
    "Mantheding",
    "Mantsha",
    "Maolwe S School",
    "Mapitlula P School",
    "Maroboni PS",
    "Masegela P School",
    "Mathibadifate SS",
    "Matome Modika S School",
    "Matseke H School",
    "Maufota P School",
    "Mavele PS",
    "Mbhekwana S School",
    "Mmakau PS",
    "Mogapene PS",
    "Mohlaba P School",
    "Mohlatlego Machaba",
    "Mokwasela Primary School",
    "Molati",
    "Morutsi P School",
    "Mphakane P School",
    "Namatsabo PS",
    "Napsadi SS",
    "Nare",
    "Ngwana makhutswe H",
    "Nkambako P School",
    "Ntwanano PS",
    "Nyantshiri P School",
    "Pelo ya Kgomo SS",
    "Ponani PS",
    "Ramoba SS",
    "Rhulani P",
    "Rita",
    "Runnymede Comm Library",
    "Sara PS",
    "Sebayeng",
    "Sehonwe P School",
    "Sekgalabyana SS",
    "Sekgopo P School",
    "Sekororo",
    "Senwamokgope PS",
    "Senwamokgope SASSA",
    "Shongani P School",
    "Solomondale",
    "Thabanatshwana P School",
    "Timamogolo PS",
    "Tingwazi PS",
    "Tours PS",
    "Tseana S School",
    "Tshangwane P School"
].sort();


// --- TypeScript interfaces for Google APIs ---
// FIX: Removed global 'any' declarations for React and ReactDOM.
// This allows TypeScript to use the proper types from @types/react and @types/react-dom,
// resolving multiple "Untyped function calls" and declaration conflict errors.
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
        request.onsuccess = () => resolve(request.result);
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
            name: `${clientName}_${date}_photo_${index + 1}.jpg`, // Updated photo naming convention
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
    record.dateTime,
    record.technicianName,
    record.clientName,
    record.contactPerson,
    record.contactPhone,
    record.gps,
    record.startTime,
    record.endTime,
    record.unitsServiced,
    record.serviceType,
    record.serviceNotes,
    record.clientNameTyped,
    record.clientCellTyped,
    record.clientSignature,
    (record.photos || []).join(', ')
];

async function ensureSheetExists(): Promise<void> {
    try {
        const sheetsResponse = await window.gapi.client.sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });

        const sheets = sheetsResponse.result.sheets;
        const sheetExists = sheets.some(
            (sheet: any) => sheet.properties.title === SHEET_NAME
        );

        if (!sheetExists) {
            console.log(`Sheet "${SHEET_NAME}" not found, creating it...`);
            await window.gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: SHEET_NAME,
                                },
                            },
                        },
                    ],
                },
            });
            await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [SHEET_HEADERS],
                },
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
    const range = `${SHEET_NAME}!A1:O1`; // Adjust range to match columns
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
        range: `${SHEET_NAME}!A2:O`, // Start from A2 to skip header
    });
    
    const rows = response.result.values || [];
    return rows.map((row, index) => ({
        rowIndex: index + 2, // Sheet rows are 1-based, and we skip header
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
        if (e.touches[0]) {
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
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
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
    
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        startDrawing(e.nativeEvent);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        draw(e.nativeEvent);
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        startDrawing(e.nativeEvent);
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        draw(e.nativeEvent);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return; // Exit if canvas is not yet available
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return; // Exit if context can't be created
        }

        // Configure the context for drawing
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        // Clear previous content
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // If there's an initial signature, draw it onto the canvas
        if(initialSignature) {
            const img = new Image();
            img.onload = () => {
                // Re-check canvas existence in case component unmounted while image was loading
                const currentCanvas = canvasRef.current;
                if (currentCanvas) {
                    const currentCtx = currentCanvas.getContext('2d');
                    currentCtx?.drawImage(img, 0, 0);
                }
            }
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
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={stopDrawing}
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
        if (!formData.dateTime) {
             setFormData(d => ({ ...d, dateTime: new Date().toLocaleString() }));
        }
        if (!formData.gps) {
            setFormData(d => ({ ...d, gps: 'Fetching...' }));
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        setFormData(d => ({...d, gps: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}));
                    },
                    () => setFormData(d => ({...d, gps: 'Could not get location'}))
                );
            } else {
                setFormData(d => ({...d, gps: 'Geolocation not supported'}));
            }
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const files = Array.from(event.target.files);
            const currentPhotos = formData.photos || [];
            const remainingSlots = MAX_PHOTOS - currentPhotos.length;
            
            files.slice(0, remainingSlots).forEach((file: File) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (e.target?.result && typeof e.target.result === 'string') {
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
                        img.src = e.target.result as string;
                    }
                };
                reader.readAsDataURL(file);
            });
        }
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
                <input type="text" value={formData.technicianName || ''} readOnly />
            </div>

            <div className="form-group">
                <label htmlFor="clientName">Client/School Name</label>
                <select id="clientName" name="clientName" value={formData.clientName || ''} onChange={handleChange} required>
                    <option value="">Select a Client</option>
                    {CLIENT_LIST.map(client => (
                        <option key={client} value={client}>{client}</option>
                    ))}
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
                <input type="text" value={formData.dateTime} readOnly />
            </div>

            <div className="form-group">
                <label>GPS Coordinates</label>
                <input type="text" value={formData.gps} readOnly />
            </div>

            <div className="form-group">
                <label htmlFor="unitsServiced">Number of Units Serviced</label>
                <input type="number" id="unitsServiced" name="unitsServiced" min="1" value={formData.unitsServiced || ''} onChange={handleChange} required/>
            </div>

            <div className="form-group">
                <label htmlFor="serviceType">Type of Service</label>
                <select id="serviceType" name="serviceType" value={formData.serviceType || ''} onChange={handleChange} required>
                    <option value="">Select Service Type</option>
                    <option value="Service & Maintenance">Service & Maintenance</option>
                    <option value="Pumping">Pumping</option>
                    <option value="Repair">Repair</option>
                    <option value="Installation">Installation</option>
                    <option value="Inspection">Inspection</option>
                </select>
            </div>

            <div className="form-group">
                <label htmlFor="serviceNotes">Service Notes / Comments</label>
                <textarea id="serviceNotes" name="serviceNotes" value={formData.serviceNotes || ''} onChange={handleChange}></textarea>
            </div>
            
            <div className="form-group">
                <label>Photos (up to {MAX_PHOTOS})</label>
                <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    multiple
                    ref={fileInputRef} 
                    onChange={handlePhotoChange}
                    style={{ display: 'none' }} 
                />
                <button type="button" className="form-button submit-button" onClick={() => fileInputRef.current?.click()} disabled={photos.length >= MAX_PHOTOS}>
                    Add Photo
                </button>
                <div className="photo-grid">
                    {photos.map((photo, index) => (
                        <div key={index} className="photo-thumbnail">
                            <img src={photo} alt={`Service photo ${index + 1}`} />
                            <button type="button" className="remove-photo-btn" onClick={() => removePhoto(index)}>X</button>
                        </div>
                    ))}
                </div>
            </div>
            
             <div className="form-group">
                <label htmlFor="clientNameTyped">Client Name (typed)</label>
                <input type="text" id="clientNameTyped" name="clientNameTyped" value={formData.clientNameTyped || ''} onChange={handleChange} required/>
            </div>

             <div className="form-group">
                <label htmlFor="clientCellTyped">Client Cell Number (typed)</label>
                <input type="tel" id="clientCellTyped" name="clientCellTyped" value={formData.clientCellTyped || ''} onChange={handleChange}/>
            </div>
            
            <div className="form-group">
                <label>Client Signature</label>
                <SignaturePad onSignatureChange={handleSignatureChange} initialSignature={formData.clientSignature || null}/>
            </div>
            
            <div className="form-buttons">
                <button type="button" className="back-button" onClick={onBack}>
                    Back
                </button>
                <button type="submit" className="submit-button">
                    Review & Submit
                </button>
            </div>
        </form>
    );
};

const ReviewScreen = ({ record, onEdit, onSubmit, isSubmitting }: { record: Partial<ServiceRecord>, onEdit: () => void, onSubmit: () => void, isSubmitting: boolean }) => {
    return (
        <div className="component-container" style={{maxWidth: '600px', margin: '0 auto'}}>
            <h2>Review Service Record</h2>
            <div className="review-item">
                <span className="review-label">Technician Name</span>
                <div className="review-value">{record.technicianName || 'N/A'}</div>
            </div>
            <div className="review-item">
                <span className="review-label">Client/School Name</span>
                <div className="review-value">{record.clientName || 'N/A'}</div>
            </div>
            <div className="review-item">
                <span className="review-label">Client Contact Person</span>
                <div className="review-value">{record.contactPerson || 'N/A'}</div>
            </div>
            <div className="review-item">
                <span className="review-label">Client Phone</span>
                <div className="review-value">{record.contactPhone || 'N/A'}</div>
            </div>
             <div className="review-item">
                <span className="review-label">Date & Time</span>
                <div className="review-value">{record.dateTime || 'N/A'}</div>
            </div>
             <div className="review-item">
                <span className="review-label">GPS Coordinates</span>
                <div className="review-value">{record.gps || 'N/A'}</div>
            </div>
            <div className="review-item">
                <span className="review-label">Units Serviced</span>
                <div className="review-value">{record.unitsServiced || 'N/A'}</div>
            </div>
            <div className="review-item">
                <span className="review-label">Service Type</span>
                <div className="review-value">{record.serviceType || 'N/A'}</div>
            </div>
             <div className="review-item">
                <span className="review-label">Service Notes</span>
                <div className="review-value notes">{record.serviceNotes || 'N/A'}</div>
            </div>
             <div className="review-item">
                <span className="review-label">Photos</span>
                <div className="photo-grid">
                     {(record.photos || []).map((photo, index) => (
                        <div key={index} className="photo-thumbnail">
                            <img src={photo} alt={`Service photo ${index + 1}`} />
                        </div>
                    ))}
                </div>
            </div>
            <div className="review-item">
                <span className="review-label">Client Name (typed)</span>
                <div className="review-value">{record.clientNameTyped || 'N/A'}</div>
            </div>
             <div className="review-item">
                <span className="review-label">Client Cell (typed)</span>
                <div className="review-value">{record.clientCellTyped || 'N/A'}</div>
            </div>
            <div className="review-item">
                <span className="review-label">Client Signature</span>
                <div className="review-signature">
                    {record.clientSignature ? <img src={record.clientSignature} alt="Client Signature" /> : 'No signature provided.'}
                </div>
            </div>

            <div className="form-buttons">
                <button type="button" className="back-button" onClick={onEdit} disabled={isSubmitting}>
                    Edit
                </button>
                <button type="button" className="final-submit-button" onClick={onSubmit} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit Record'}
                </button>
            </div>
        </div>
    );
}

const LoginScreen = ({ isReady, loadingError }: { isReady: boolean, loadingError: string | null }) => {
    
    const handleLoginClick = () => {
        if (window.tokenClient) {
            window.tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    }

    const origin = window.location.origin;

    const handleCopyClick = () => {
        navigator.clipboard.writeText(origin).then(() => {
            alert(`Copied to clipboard: ${origin}`);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Failed to copy. Please select and copy it manually.');
        });
    };
    
    return (
        <div className="component-container login-container">
            <h2>Welcome</h2>
            {loadingError ? (
                <div className="login-error" style={{whiteSpace: 'pre-wrap', textAlign: 'left'}}>{loadingError}</div>
            ) : (
                <>
                    <p>Please sign in to continue.</p>
                    <button className="login-button" onClick={handleLoginClick} disabled={!isReady}>
                        <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>
                        {isReady ? 'Sign in with Google' : 'Initializing...'}
                    </button>
                    <div className="troubleshooting-box">
                        <h3>Still Seeing "Error 400: invalid_request"?</h3>
                        <p>This is a common but fixable Google security setting. Let's walk through the final steps to solve it.</p>
                        
                        <div className="final-checklist">
                            <h4>Final Checklist Before You Start:</h4>
                            <ul>
                                <li><strong>Correct Client ID?</strong> Does the <code>CLIENT_ID</code> in the code exactly match the ID of the credential you are editing in Google Cloud?</li>
                                <li><strong>Exact URL?</strong> Did you copy the URL below with no typos and <strong>no trailing slash (`/`)</strong> at the end?</li>
                                <li><strong>URL in BOTH places?</strong> Is the exact same URL listed under <strong>both</strong> "Authorized JavaScript origins" and "Authorized redirect URIs"?</li>
                            </ul>
                        </div>

                        <h4>Step 1: Copy Your App's Exact URL</h4>
                        <p>Your app is running from this unique URL. Click to copy it:</p>
                        <div className="copy-url-box">
                            <code>{origin}</code>
                            <button onClick={handleCopyClick}>Copy</button>
                        </div>

                        <h4>Step 2: Add the URL to Google Cloud</h4>
                        <ol>
                            <li>Go to the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Credentials</a> page.</li>
                            <li>Find the "OAuth 2.0 Client IDs" section and click on the name of your client ID (e.g., "Web client 1").</li>
                            <li>
                                <strong>Add to Authorized JavaScript origins:</strong>
                                 <ul>
                                    <li>Click <strong>"+ ADD URI"</strong> and paste the exact URL you just copied.</li>
                                </ul>
                            </li>
                             <li>
                                <strong>(Important) Also Add to Authorized redirect URIs:</strong>
                                <ul>
                                   <li>Click <strong>"+ ADD URI"</strong> and paste the <strong>same exact URL again</strong>.</li>
                                </ul>
                            </li>
                            <li>Click <strong>"Save"</strong> at the bottom of the page.</li>
                        </ol>
                        
                        <h4>Step 3: Check Your Publishing Status</h4>
                        <p>Go to the <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer">OAuth consent screen</a> page.</p>
                        <ul>
                            <li><strong>If "In production":</strong> You are all set. The error is from the URLs in Step 2.</li>
                            <li><strong>If "Testing":</strong> You must add your email to the "Test users" list on this page.</li>
                        </ul>
                        
                        <h4>Step 4: Apply Changes and Retry (Crucial!)</h4>
                        <ol>
                            <li><strong>Wait:</strong> After clicking "Save" in Google Cloud, wait for <strong>1-2 minutes</strong> for the changes to take effect across Google's servers.</li>
                            <li><strong>Hard Refresh:</strong> Press <strong>Ctrl+Shift+R</strong> (or <strong>Cmd+Shift+R</strong> on Mac) on this app page to force a full refresh, ignoring any cached data.</li>
                            <li><strong>Try Incognito:</strong> If it still fails, open a new <strong>Incognito or Private window</strong> in your browser, navigate to this page, and try signing in again. This ensures no old login data is interfering.</li>
                        </ol>

                    </div>
                </>
            )}
        </div>
    );
};

const EditRecordModal = ({ record, onSave, onClose }: { record: ServiceRecord, onSave: (updatedRecord: ServiceRecord) => void, onClose: () => void }) => {
    const [formData, setFormData] = useState<ServiceRecord>(record);
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value as any }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(formData);
        } catch (error) {
            console.error("Failed to save changes:", error);
            alert("Failed to save changes. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Edit Service Record</h3>
                <div className="form-group">
                    <label>Technician Name</label>
                    <input type="text" value={formData.technicianName} readOnly className="modal-readonly-field" />
                </div>
                <div className="form-group">
                    <label htmlFor="clientName">Client Name</label>
                    <input type="text" id="clientName" name="clientName" value={formData.clientName} onChange={handleChange} />
                </div>
                <div className="form-group">
                    <label htmlFor="contactPerson">Contact Person</label>
                    <input type="text" id="contactPerson" name="contactPerson" value={formData.contactPerson} onChange={handleChange} />
                </div>
                <div className="form-group">
                    <label htmlFor="contactPhone">Contact Phone</label>
                    <input type="tel" id="contactPhone" name="contactPhone" value={formData.contactPhone} onChange={handleChange} />
                </div>
                 <div className="form-group">
                    <label htmlFor="serviceNotes">Service Notes</label>
                    <textarea id="serviceNotes" name="serviceNotes" value={formData.serviceNotes} onChange={handleChange}></textarea>
                </div>
                <div className="form-group">
                    <label>Photos</label>
                    <div>
                        {(formData.photos || []).map((photo, index) => (
                            <a href={photo} key={index} target="_blank" rel="noopener noreferrer" className="modal-photo-link">
                                Photo {index + 1}
                            </a>
                        ))}
                    </div>
                </div>
                 <div className="form-group">
                    <label>Client Signature</label>
                    {formData.clientSignature ? <img src={formData.clientSignature} alt="Client Signature" style={{border: '1px solid #ccc', borderRadius: '4px', maxWidth: '200px'}} /> : 'No signature'}
                </div>
                <div className="form-buttons">
                    <button type="button" className="back-button" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button type="button" className="submit-button" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AdminDashboard = () => {
    const [records, setRecords] = useState<ServiceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [recordToEdit, setRecordToEdit] = useState<ServiceRecord | null>(null);
    
    const fetchRecords = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getAllRecordsFromSheet();
            setRecords(data);
        } catch (err) {
            console.error("Failed to fetch records:", err);
            setError("Failed to fetch records. Please check your connection and API configuration.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, []);

    const handleSaveEdit = async (updatedRecord: ServiceRecord) => {
        await updateRecordInSheet(updatedRecord);
        setRecords(prevRecords => prevRecords.map(r => r.rowIndex === updatedRecord.rowIndex ? updatedRecord : r));
        setRecordToEdit(null); // Close modal
        alert("Record updated successfully!");
    };

    if (isLoading) return <div className="component-container"><h2>Loading Records...</h2></div>;
    if (error) return <div className="component-container" style={{color: 'red'}}><h2>Error</h2><p>{error}</p></div>;

    return (
        <div className="component-container admin-dashboard">
            <h2>Admin Dashboard</h2>
            <div className="table-container">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Technician</th>
                            <th>Client</th>
                            <th>Service Type</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {records.map(record => (
                            <tr key={record.rowIndex}>
                                <td>{new Date(record.dateTime).toLocaleDateString()}</td>
                                <td>{record.technicianName}</td>
                                <td>{record.clientName}</td>
                                <td>{record.serviceType}</td>
                                <td className="action-cell">
                                    <button className="edit-button" onClick={() => setRecordToEdit(record)}>Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
             {recordToEdit && (
                <EditRecordModal 
                    record={recordToEdit}
                    onSave={handleSaveEdit}
                    onClose={() => setRecordToEdit(null)}
                />
            )}
        </div>
    );
};

type View = 'HOME' | 'NEW_SERVICE' | 'REVIEW' | 'ADMIN';

const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [view, setView] = useState<View>('HOME');
    const [currentRecord, setCurrentRecord] = useState<Partial<ServiceRecord>>(emptyRecord);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);
    const [gapiReady, setGapiReady] = useState(false);
    const [gisReady, setGisReady] = useState(false);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    
    const scriptsLoadedRef = useRef(false);
    const isApiReady = gapiReady && gisReady;

    const handleLogin = useCallback((loggedInUser: User) => {
        setUser(loggedInUser);
        if (loggedInUser.role === 'admin') {
            setView('ADMIN');
        } else {
            setView('HOME');
        }
    }, []);

    // --- Sync Offline Data on App Load ---
    useEffect(() => {
        if (user && isApiReady && navigator.onLine) {
            const syncOfflineData = async () => {
                const pendingRecords = await getAllPendingRecords();
                if (pendingRecords.length > 0) {
                    setSyncMessage(`Syncing ${pendingRecords.length} offline record(s)...`);
                    let successCount = 0;
                    for (const record of pendingRecords) {
                        try {
                           await submitRecord(record);
                           await deletePendingRecord(record.id!);
                           successCount++;
                        } catch (error) {
                             console.error("Failed to sync offline record:", error);
                        }
                    }
                    setSyncMessage(`Synced ${successCount} of ${pendingRecords.length} record(s).`);
                    setTimeout(() => setSyncMessage(null), 5000);
                }
            };
            syncOfflineData();
        }
    }, [user, isApiReady]);
    
    // Process a single record submission (used by both online and sync)
    const submitRecord = async (record: Partial<ServiceRecord>) => {
         const recordWithEndTime: Partial<ServiceRecord> = {
            ...record,
            endTime: record.endTime || new Date().toISOString()
        };
        const photoUrls = await uploadPhotosToDrive(record.photos || [], recordWithEndTime);
        const finalRecord: Partial<ServiceRecord> = {
            ...recordWithEndTime,
            photos: photoUrls,
        };
        await saveRecordToSheet(finalRecord);
    };

    // --- Google API Initialization ---
    useEffect(() => {
        if (scriptsLoadedRef.current) return;
        scriptsLoadedRef.current = true;

        const loadScript = (src: string, id: string) => new Promise<void>((resolve, reject) => {
            if (document.getElementById(id)) {
                return resolve();
            }
            const script = document.createElement('script');
            script.src = src;
            script.id = id;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = (err) => reject(new Error(`Failed to load script ${src}: ${err}`));
            document.body.appendChild(script);
        });

        const initializeApis = async () => {
            try {
                // Load GAPI and GIS scripts in parallel for efficiency
                await Promise.all([
                    loadScript('https://apis.google.com/js/api.js', 'gapi-script'),
                    loadScript('https://accounts.google.com/gsi/client', 'gis-script')
                ]);

                // Initialize GIS token client for authentication
                window.tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: async (tokenResponse: any) => {
                        if (tokenResponse.access_token) {
                            window.gapi.client.setToken({ access_token: tokenResponse.access_token });
                            
                            // Ensure sheet exists before proceeding
                            try {
                                await ensureSheetExists();
                            } catch (sheetError: any) {
                                alert(`Error setting up Google Sheet: ${sheetError.message}`);
                                setLoadingError(`Error setting up Google Sheet: ${sheetError.message}`);
                                return; // Stop login process if sheet setup fails
                            }

                            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                               headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
                            });
                            const profile = await res.json();
                            
                            const loggedInUser: User = {
                               name: profile.name,
                               email: profile.email,
                               picture: profile.picture,
                               role: ADMIN_EMAILS.includes(profile.email) ? 'admin' : 'technician'
                            };
                            handleLogin(loggedInUser);
                        }
                    },
                });
                setGisReady(true);

                // Wait for GAPI to be ready and then initialize the client
                await new Promise<void>((resolve, reject) => {
                    window.gapi.load('client', {
                        callback: resolve,
                        onerror: reject,
                        timeout: 5000,
                        ontimeout: () => reject(new Error('gapi.load timeout'))
                    });
                });

                await window.gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: [
                        'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
                        'https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest'
                    ],
                });
                setGapiReady(true);

            } catch (error: any) {
                console.error("Google API Initialization failed:", error);
                const origin = window.location.origin;
                const errorMessage = `Action Required: Could not connect to Google APIs.\n\n` +
                       `This usually happens because of a misconfiguration in your Google Cloud project. Please follow these steps carefully:\n\n` +
                       `1. Check API Key Referrer Restrictions\n` +
                       `Your app is running from this URL:\n${origin}\n\n` +
                       `You MUST add this exact URL to the "Website restrictions" list for your API Key in the Google Cloud Console.\n` +
                       `  • Go to: https://console.cloud.google.com/apis/credentials\n` +
                       `  • Find your API Key.\n` +
                       `  • Under "Application restrictions", select "Websites".\n` +
                       `  • Click "ADD" and paste the URL above.\n` +
                       `  • Click "Save".\n\n` +
                       `2. Ensure APIs are Enabled\n` +
                       `Make sure both the "Google Drive API" and "Google Sheets API" are enabled for your project.\n\n` +
                       `----------------------------------------\n` +
                       `Technical Error: ${error.message || 'Unknown error'}`;
                setLoadingError(errorMessage);
            }
        };

        initializeApis();

    }, [handleLogin]);


    const handleLogout = () => {
        setUser(null);
        setView('HOME');
        if (window.gapi?.client?.getToken()) {
            window.google.accounts.oauth2.revoke(window.gapi.client.getToken().access_token, () => {});
            window.gapi.client.setToken(null);
        }
    };

    const handleNewService = () => {
        if (!user) return;
        setCurrentRecord({ 
            ...emptyRecord,
            technicianName: user.name,
            startTime: new Date().toISOString()
        });
        setView('NEW_SERVICE');
    };

    const handleReview = (data: Partial<ServiceRecord>) => {
        setCurrentRecord(data);
        setView('REVIEW');
    };

    const handleEdit = () => {
        setView('NEW_SERVICE');
    };

    const handleSubmit = async () => {
        if ((currentRecord.photos || []).length === 0) {
            alert("Please add at least one photo before submitting.");
            return;
        }

        // --- OFFLINE LOGIC ---
        if (!navigator.onLine) {
            try {
                await saveRecordOffline(currentRecord);
                alert("You are offline. Record has been saved locally and will be submitted automatically when you are back online.");
                setView('HOME');
                setCurrentRecord(emptyRecord);
            } catch (error) {
                 console.error("Failed to save record offline:", error);
                 alert("Could not save the record for offline submission. Please try again.");
            }
            return;
        }

        // --- ONLINE LOGIC ---
        setIsSubmitting(true);
        try {
            await submitRecord(currentRecord);
            alert("Service record submitted successfully!");
            setView('HOME');
            setCurrentRecord(emptyRecord);
        } catch (error) {
            console.error("Submission failed:", error);
            alert("Submission failed. Please check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleBackToHome = () => {
        setView('HOME');
        setCurrentRecord(emptyRecord);
    }

    if (!user) {
        return <LoginScreen isReady={isApiReady} loadingError={loadingError} />;
    }

    const renderContent = () => {
        switch (view) {
            case 'NEW_SERVICE':
                return <ServiceForm onBack={handleBackToHome} onReview={handleReview} initialData={currentRecord} />;
            case 'REVIEW':
                return <ReviewScreen record={currentRecord} onEdit={handleEdit} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
            case 'ADMIN':
                return <AdminDashboard />;
            case 'HOME':
            default:
                return (
                     <main className="main-content" style={{maxWidth: '600px', margin: '0 auto'}}>
                        {syncMessage && <div className="sync-notification">{syncMessage}</div>}
                        <button
                            className="new-service-button"
                            onClick={handleNewService}
                            aria-label="Create a new service record"
                        >
                            + New Service Record
                        </button>
                    </main>
                );
        }
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <h1>SemaKL Enviro Loo</h1>
                {user && (
                    <div className="header-user-info">
                        <span>{user.name}</span>
                        <button className="logout-button" onClick={handleLogout}>Logout</button>
                    </div>
                )}
            </header>
            {renderContent()}
        </div>
    );
};

const container = document.getElementById('root');
// FIX: Switched to ReactDOM.render to match older @types/react-dom version
// which does not have the 'createRoot' API, resolving the property not found error.
ReactDOM.render(<App />, container);
