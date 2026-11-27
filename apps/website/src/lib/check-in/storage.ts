import { isAppData, type AppData } from './types';

const DATABASE_NAME = 'gatebook';
const DATABASE_VERSION = 1;
const STORE_NAME = 'app';
const STATE_KEY = 'state';

function openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('This browser does not support local offline storage.'));
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => database.close();
            resolve(database);
        };
        request.onerror = () => {
            reject(request.error ?? new Error('The local check-in database could not be opened.'));
        };
        request.onblocked = () => {
            reject(new Error('Close other Gatebook tabs, then reload this page.'));
        };
    });
}

export async function loadAppData(): Promise<AppData | null> {
    const database = await openDatabase();

    try {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
        const result = await requestResult(request);

        if (result === undefined) return null;
        if (!isAppData(result)) {
            throw new Error(
                'Saved check-in data has an unsupported format. Import a Gatebook backup to recover it.'
            );
        }

        return result;
    } finally {
        database.close();
    }
}

export async function saveAppData(data: AppData): Promise<void> {
    const database = await openDatabase();

    try {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(data, STATE_KEY);
        await transactionResult(transaction);
    } finally {
        database.close();
    }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            reject(request.error ?? new Error('The local check-in data could not be read.'));
        };
    });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            reject(transaction.error ?? new Error('The local check-in data could not be saved.'));
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error('The local check-in data could not be saved.'));
        };
    });
}
