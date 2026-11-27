export type Attendee = {
    id: string;
    values: Record<string, string>;
};

export type HistoricalAttendee = {
    id: string;
    name: string;
    email: string;
};

export type EventRegister = {
    id: string;
    label: string;
    startedAt: string;
    completedAt: string | null;
    expectedColumn: string;
    expectedValues: string[];
    attendees: HistoricalAttendee[];
    checkIns: Record<string, string>;
    notHere: Record<string, string>;
};

export type EventData = {
    name: string;
    registers: EventRegister[];
    currentRegisterId: string;
};

export type AppData = {
    version: 1;
    headers: string[];
    roster: Attendee[];
    sourceFile: string | null;
    event: EventData;
};

export type ImportedRoster = {
    headers: string[];
    attendees: Attendee[];
};

export function createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getAttendeeName(attendee: Attendee | HistoricalAttendee): string {
    if ('name' in attendee) return attendee.name || 'Unnamed attendee';

    const entries = Object.entries(attendee.values);
    const normalized = entries.map(([key, value]) => [key.toLocaleLowerCase(), value] as const);
    const firstName = normalized.find(([key]) => /\b(first|given)\s*name\b/.test(key))?.[1]?.trim();
    const lastName = normalized
        .find(([key]) => /\b(last|family|surname)\s*name\b/.test(key))?.[1]
        ?.trim();
    if (firstName || lastName) return [firstName, lastName].filter(Boolean).join(' ');

    const namedValue = normalized.find(
        ([key, value]) => value.trim() && /\bname\b/.test(key) && !/email/.test(key)
    )?.[1];
    if (namedValue) return namedValue.trim();

    const otherValue = entries
        .find(([key, value]) => !/email/i.test(key) && value.trim())?.[1]
        .trim();
    return otherValue ?? (getAttendeeEmail(attendee) || 'Unnamed attendee');
}

export function getAttendeeEmail(attendee: Attendee | HistoricalAttendee): string {
    if ('email' in attendee) return attendee.email;

    return (
        Object.entries(attendee.values)
            .find(([key]) => /e-?mai(?:l)?/i.test(key))?.[1]
            .trim() ?? ''
    );
}

export function toHistoricalAttendee(attendee: Attendee): HistoricalAttendee {
    return {
        id: attendee.id,
        name: getAttendeeName(attendee),
        email: getAttendeeEmail(attendee)
    };
}

export function createRegister(
    label: string,
    attendees: Attendee[],
    startedAt = new Date().toISOString(),
    expectedColumn = '',
    expectedValues: string[] = []
): EventRegister {
    return {
        id: createId(),
        label,
        startedAt,
        completedAt: null,
        expectedColumn,
        expectedValues,
        attendees: attendees
            .filter((attendee) => matchesExpectedValues(attendee, expectedColumn, expectedValues))
            .map(toHistoricalAttendee),
        checkIns: {},
        notHere: {}
    };
}

export function matchesExpectedValues(
    attendee: Attendee,
    column: string,
    selectedValues: string[]
): boolean {
    if (!column || selectedValues.length === 0) return true;
    const value = attendee.values[column] || '\u0000blank';
    return selectedValues.includes(value);
}

export function createAppData(): AppData {
    const firstRegister = createRegister('First register', []);

    return {
        version: 1,
        headers: [],
        roster: [],
        sourceFile: null,
        event: {
            name: 'Event day',
            registers: [firstRegister],
            currentRegisterId: firstRegister.id
        }
    };
}

export function isAppData(value: unknown): value is AppData {
    if (!isRecord(value) || value.version !== 1) return false;
    const headers = value.headers;
    const event = value.event;
    if (!Array.isArray(headers) || !headers.every((item) => typeof item === 'string')) {
        return false;
    }
    if (!Array.isArray(value.roster) || !value.roster.every(isAttendee)) return false;
    if (value.sourceFile !== null && typeof value.sourceFile !== 'string') return false;
    if (!isRecord(event) || typeof event.name !== 'string') return false;
    if (
        typeof event.currentRegisterId !== 'string' ||
        !Array.isArray(event.registers) ||
        !event.registers.every(isRegister)
    ) {
        return false;
    }
    if (
        event.registers.some(
            (register) =>
                register.expectedValues.length > 0 && !headers.includes(register.expectedColumn)
        )
    ) {
        return false;
    }

    return event.registers.some((item) => item.id === event.currentRegisterId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAttendee(value: unknown): value is Attendee {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        isRecord(value.values) &&
        Object.values(value.values).every((item) => typeof item === 'string')
    );
}

function isHistoricalAttendee(value: unknown): value is HistoricalAttendee {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.email === 'string'
    );
}

function isRegister(value: unknown): value is EventRegister {
    const checkIns = isRecord(value) ? value.checkIns : null;
    const notHere = isRecord(value) ? value.notHere : null;
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        typeof value.label === 'string' &&
        typeof value.startedAt === 'string' &&
        !Number.isNaN(Date.parse(value.startedAt)) &&
        (value.completedAt === null ||
            (typeof value.completedAt === 'string' &&
                !Number.isNaN(Date.parse(value.completedAt)))) &&
        typeof value.expectedColumn === 'string' &&
        Array.isArray(value.expectedValues) &&
        value.expectedValues.every((item) => typeof item === 'string') &&
        Array.isArray(value.attendees) &&
        value.attendees.every(isHistoricalAttendee) &&
        isRecord(checkIns) &&
        Object.values(checkIns).every((item) => typeof item === 'string') &&
        isRecord(notHere) &&
        Object.values(notHere).every((item) => typeof item === 'string') &&
        !hasOverlappingStatuses(checkIns, notHere)
    );
}

function hasOverlappingStatuses(checkIns: unknown, notHere: unknown): boolean {
    if (!isRecord(checkIns) || !isRecord(notHere)) return false;
    return Object.keys(checkIns).some((id) => id in notHere);
}
