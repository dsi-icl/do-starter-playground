import * as XLSX from 'xlsx';

import { createId, type Attendee, type ImportedRoster } from './types';

export function getWorkbookSheets(buffer: ArrayBuffer): string[] {
    const workbook = XLSX.read(buffer, { type: 'array' });
    return workbook.SheetNames;
}

export function parseWorkbookSheet(buffer: ArrayBuffer, sheetName: string): ImportedRoster {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error('That worksheet could not be found in this workbook.');

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: ''
    });
    const headerRow = rows[0];
    if (!headerRow) throw new Error('This worksheet is empty.');

    const headers = makeUniqueHeaders(headerRow);
    if (headers.every((header) => !header)) {
        throw new Error('The first row needs column headings, such as Name and Email.');
    }

    const attendees = rows
        .slice(1)
        .filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
        .map(
            (row): Attendee => ({
                id: createId(),
                values: Object.fromEntries(
                    headers.map((header, index) => [header, String(row[index] ?? '').trim()])
                )
            })
        );

    if (attendees.length === 0) throw new Error('No attendee rows were found below the headings.');

    return { headers, attendees };
}

function makeUniqueHeaders(cells: unknown[]): string[] {
    if (cells.every((cell) => !String(cell ?? '').trim())) {
        throw new Error('The first row needs column headings, such as Name and Email.');
    }

    const occurrences = new Map<string, number>();

    return cells.map((cell, index) => {
        const baseName = String(cell ?? '').trim() || `Column ${index + 1}`;
        const count = (occurrences.get(baseName) ?? 0) + 1;
        occurrences.set(baseName, count);
        return count === 1 ? baseName : `${baseName} (${count})`;
    });
}
