import {
    ArrowCounterClockwiseIcon,
    ArrowDownIcon,
    CheckIcon,
    ClockCounterClockwiseIcon,
    DownloadSimpleIcon,
    FileArrowDownIcon,
    MagnifyingGlassIcon,
    PencilSimpleIcon,
    PlusIcon,
    SlidersHorizontalIcon,
    TrashIcon,
    UploadSimpleIcon,
    UsersIcon,
    WifiSlashIcon,
    XIcon
} from '@phosphor-icons/react';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getWorkbookSheets, parseWorkbookSheet } from '../lib/check-in/spreadsheet';
import { loadAppData, saveAppData } from '../lib/check-in/storage';
import {
    createAppData,
    createId,
    createRegister,
    getAttendeeEmail,
    getAttendeeName,
    isAppData,
    matchesExpectedValues,
    toHistoricalAttendee,
    type AppData,
    type Attendee,
    type EventRegister,
    type HistoricalAttendee,
    type ImportedRoster
} from '../lib/check-in/types';

export const Route = createFileRoute('/')({
    component: HomePage
});

type DialogState =
    | { type: 'new-event' }
    | { type: 'rename-event' }
    | { type: 'next-register' }
    | { type: 'attendee'; attendeeId: string | null }
    | { type: 'import' }
    | { type: 'restore' }
    | { type: 'history' }
    | { type: 'install' }
    | null;

type SaveState = 'loading' | 'saving' | 'saved' | 'error';
type InstallPrompt = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const EMPTY_VALUE = '\u0000blank';
const PAGE_SIZE = 80;

function HomePage() {
    const [data, setData] = useState<AppData | null>(null);
    const [saveState, setSaveState] = useState<SaveState>('loading');
    const [storageError, setStorageError] = useState('');
    const [actionError, setActionError] = useState('');
    const [isOnline, setIsOnline] = useState(true);
    const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
    const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
    const [installed, setInstalled] = useState(false);
    const [dialog, setDialog] = useState<DialogState>(null);
    const [search, setSearch] = useState('');
    const [filterColumn, setFilterColumn] = useState('');
    const [selectedValues, setSelectedValues] = useState<string[]>([]);
    const [filterSearch, setFilterSearch] = useState('');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const [showMissedEarlier, setShowMissedEarlier] = useState(false);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [backupMenuOpen, setBackupMenuOpen] = useState(false);
    const persistenceQueue = useRef(Promise.resolve());
    const persistenceRevision = useRef(0);

    useEffect(() => {
        let cancelled = false;

        void loadAppData()
            .then((savedData) => {
                if (!cancelled) {
                    setData(savedData ?? createAppData());
                    const savedRegister = savedData?.event.registers.find(
                        (register) => register.id === savedData.event.currentRegisterId
                    );
                    setFilterColumn(savedRegister?.expectedColumn ?? '');
                    setSelectedValues(savedRegister?.expectedValues ?? []);
                    setSaveState('saved');
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    const message = errorMessage(error);
                    setStorageError(message);
                    setData(createAppData());
                    setSaveState('error');
                }
            });

        const updateConnection = () => setIsOnline(navigator.onLine);
        updateConnection();
        window.addEventListener('online', updateConnection);
        window.addEventListener('offline', updateConnection);

        const handleInstallPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPrompt(event as InstallPrompt);
        };
        const handleInstalled = () => {
            setInstalled(true);
            setInstallPrompt(null);
        };
        window.addEventListener('beforeinstallprompt', handleInstallPrompt);
        window.addEventListener('appinstalled', handleInstalled);
        setInstalled(window.matchMedia('(display-mode: standalone)').matches);

        if ('serviceWorker' in navigator) {
            if (import.meta.env.PROD) {
                void navigator.serviceWorker
                    .register(`${import.meta.env.BASE_URL}sw.js`, {
                        scope: import.meta.env.BASE_URL
                    })
                    .then(() => navigator.serviceWorker.ready)
                    .then(() => setServiceWorkerReady(true))
                    .catch((error: unknown) => {
                        setActionError(
                            `Offline setup could not finish: ${errorMessage(error)} Load the app online again to retry.`
                        );
                    });
            } else {
                setServiceWorkerReady(true);
            }
        } else {
            setActionError('This browser does not support offline app installation.');
        }

        return () => {
            cancelled = true;
            window.removeEventListener('online', updateConnection);
            window.removeEventListener('offline', updateConnection);
            window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
            window.removeEventListener('appinstalled', handleInstalled);
        };
    }, []);

    const currentRegister = data?.event.registers.find(
        (register) => register.id === data.event.currentRegisterId
    );
    const currentRegisterIndex = data?.event.registers.findIndex(
        (register) => register.id === data.event.currentRegisterId
    );
    const priorRegisters = useMemo(() => {
        if (!data || currentRegisterIndex === undefined || currentRegisterIndex < 0) return [];
        return data.event.registers
            .slice(0, currentRegisterIndex)
            .filter((register) => register.completedAt !== null);
    }, [data, currentRegisterIndex]);

    const missedRegistersById = useMemo(() => {
        const missedById = new Map<
            string,
            Array<{ label: string; status: 'not-here' | 'unmarked' }>
        >();

        for (const register of priorRegisters) {
            for (const attendee of register.attendees) {
                if (!register.checkIns[attendee.id]) {
                    const missed = missedById.get(attendee.id) ?? [];
                    missed.push({
                        label: register.label,
                        status: register.notHere[attendee.id] ? 'not-here' : 'unmarked'
                    });
                    missedById.set(attendee.id, missed);
                }
            }
        }

        return missedById;
    }, [priorRegisters]);
    const missedPeopleCount = data
        ? data.roster.filter((attendee) => missedRegistersById.has(attendee.id)).length
        : 0;
    const expectedAttendees = useMemo(() => {
        if (!data) return [];
        return data.roster.filter((attendee) => {
            if (selectedValues.length === 0) return true;
            return selectedValues.includes(attendee.values[filterColumn] || EMPTY_VALUE);
        });
    }, [data, filterColumn, selectedValues]);

    const uniqueValues = useMemo(() => {
        if (!data || !filterColumn) return [];
        const values = new Set(
            data.roster.map((attendee) => attendee.values[filterColumn] || EMPTY_VALUE)
        );
        return [...values].sort((a, b) =>
            displayFilterValue(a).localeCompare(displayFilterValue(b))
        );
    }, [data, filterColumn]);

    const visibleFilterValues = useMemo(() => {
        const normalizedSearch = filterSearch.trim().toLocaleLowerCase();
        const matching = uniqueValues.filter((value) =>
            displayFilterValue(value).toLocaleLowerCase().includes(normalizedSearch)
        );
        return showMoreFilters ? matching : matching.slice(0, 80);
    }, [filterSearch, showMoreFilters, uniqueValues]);

    const filteredAttendees = useMemo(() => {
        if (!data) return [];
        const normalizedSearch = search.trim().toLocaleLowerCase();

        return data.roster.filter((attendee) => {
            const name = getAttendeeName(attendee).toLocaleLowerCase();
            const email = getAttendeeEmail(attendee).toLocaleLowerCase();
            if (
                normalizedSearch &&
                !name.includes(normalizedSearch) &&
                !email.includes(normalizedSearch)
            ) {
                return false;
            }

            if (selectedValues.length > 0) {
                const value = attendee.values[filterColumn] || EMPTY_VALUE;
                if (!selectedValues.includes(value)) return false;
            }

            if (showMissedEarlier && !missedRegistersById.has(attendee.id)) return false;
            return true;
        });
    }, [data, filterColumn, missedRegistersById, search, selectedValues, showMissedEarlier]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [filterColumn, search, selectedValues, showMissedEarlier]);

    const setAndSave = (nextData: AppData) => {
        setData(nextData);
        setStorageError('');
        setSaveState('saving');
        const revision = ++persistenceRevision.current;

        persistenceQueue.current = persistenceQueue.current
            .catch(() => undefined)
            .then(() => saveAppData(nextData))
            .then(() => {
                if (revision === persistenceRevision.current) setSaveState('saved');
            })
            .catch((error: unknown) => {
                if (revision === persistenceRevision.current) {
                    setStorageError(
                        `Your latest changes were not saved on this device: ${errorMessage(error)} Export a backup before leaving this page.`
                    );
                    setSaveState('error');
                }
            });
    };

    const updateData = (update: (current: AppData) => AppData) => {
        if (!data) return;
        setAndSave(update(data));
    };

    const changeFilterColumn = (column: string) => {
        setFilterColumn(column);
        setSelectedValues([]);
        if (!data || !currentRegister) return;
        const register = {
            ...currentRegister,
            expectedColumn: column,
            expectedValues: [],
            attendees: data.roster
                .filter((attendee) => matchesExpectedValues(attendee, column, []))
                .map(toHistoricalAttendee)
        };
        setAndSave({ ...data, event: replaceRegister(data.event, register) });
    };

    const changeSelectedValues = (values: string[]) => {
        setSelectedValues(values);
        if (!data || !currentRegister) return;
        const register = {
            ...currentRegister,
            expectedColumn: filterColumn,
            expectedValues: values,
            attendees: data.roster
                .filter((attendee) => matchesExpectedValues(attendee, filterColumn, values))
                .map(toHistoricalAttendee)
        };
        setAndSave({ ...data, event: replaceRegister(data.event, register) });
    };

    const closeDialog = () => setDialog(null);

    const handleToggleCheckIn = (attendeeId: string) => {
        if (!data || !currentRegister) return;
        const checkIns = { ...currentRegister.checkIns };
        const notHere = { ...currentRegister.notHere };
        if (checkIns[attendeeId]) {
            delete checkIns[attendeeId];
        } else {
            checkIns[attendeeId] = new Date().toISOString();
            delete notHere[attendeeId];
        }

        setAndSave({
            ...data,
            event: replaceRegister(data.event, { ...currentRegister, checkIns, notHere })
        });
    };

    const handleToggleNotHere = (attendeeId: string) => {
        if (!data || !currentRegister) return;
        const checkIns = { ...currentRegister.checkIns };
        const notHere = { ...currentRegister.notHere };
        if (notHere[attendeeId]) {
            delete notHere[attendeeId];
        } else {
            notHere[attendeeId] = new Date().toISOString();
            delete checkIns[attendeeId];
        }

        setAndSave({
            ...data,
            event: replaceRegister(data.event, { ...currentRegister, checkIns, notHere })
        });
    };

    const handleStartNextRegister = (nextLabel: string) => {
        if (!data || !currentRegister) return;
        const now = new Date().toISOString();
        const checkedIds = new Set(expectedAttendees.map((attendee) => attendee.id));
        const completedRegister: EventRegister = {
            ...currentRegister,
            completedAt: now,
            attendees: expectedAttendees.map(toHistoricalAttendee),
            checkIns: Object.fromEntries(
                Object.entries(currentRegister.checkIns).filter(([id]) => checkedIds.has(id))
            ),
            notHere: Object.fromEntries(
                Object.entries(currentRegister.notHere).filter(([id]) => checkedIds.has(id))
            )
        };
        const nextRegister = createRegister(
            nextLabel,
            data.roster,
            now,
            currentRegister.expectedColumn,
            currentRegister.expectedValues
        );
        setAndSave({
            ...data,
            event: {
                ...data.event,
                registers: [
                    ...data.event.registers.filter(
                        (register) => register.id !== currentRegister.id
                    ),
                    completedRegister,
                    nextRegister
                ],
                currentRegisterId: nextRegister.id
            }
        });
        setFilterColumn(currentRegister.expectedColumn);
        setSelectedValues(currentRegister.expectedValues);
        closeDialog();
    };

    const handleStartNewEvent = (name: string) => {
        if (!data) return;
        const firstRegister = createRegister('First register', data.roster);
        setAndSave({
            ...data,
            event: {
                name,
                registers: [firstRegister],
                currentRegisterId: firstRegister.id
            }
        });
        setFilterColumn('');
        setSelectedValues([]);
        closeDialog();
    };

    const handleImportRoster = (roster: ImportedRoster, fileName: string) => {
        if (!data) return;
        const firstRegister = createRegister('First register', roster.attendees);
        setAndSave({
            ...data,
            headers: roster.headers,
            roster: roster.attendees,
            sourceFile: fileName,
            event: {
                name: data.event.name,
                registers: [firstRegister],
                currentRegisterId: firstRegister.id
            }
        });
        setSelectedValues([]);
        setFilterColumn('');
        setShowMissedEarlier(false);
        closeDialog();
    };

    const handleSaveAttendee = (attendee: Attendee) => {
        if (!data || !currentRegister) return;
        const existing = data.roster.some((person) => person.id === attendee.id);
        const roster = existing
            ? data.roster.map((person) => (person.id === attendee.id ? attendee : person))
            : [...data.roster, attendee];
        const registerAttendees = roster
            .filter((person) =>
                matchesExpectedValues(
                    person,
                    currentRegister.expectedColumn,
                    currentRegister.expectedValues
                )
            )
            .map(toHistoricalAttendee);
        setAndSave({
            ...data,
            roster,
            event: replaceRegister(data.event, {
                ...currentRegister,
                attendees: registerAttendees
            })
        });
        closeDialog();
    };

    const handleRemoveAttendee = (attendeeId: string) => {
        if (!data || !currentRegister) return;
        const roster = data.roster.filter((attendee) => attendee.id !== attendeeId);
        const checkIns = { ...currentRegister.checkIns };
        const notHere = { ...currentRegister.notHere };
        delete checkIns[attendeeId];
        delete notHere[attendeeId];
        setAndSave({
            ...data,
            roster,
            event: replaceRegister(data.event, {
                ...currentRegister,
                attendees: currentRegister.attendees.filter((person) => person.id !== attendeeId),
                checkIns,
                notHere
            })
        });
        closeDialog();
    };

    const handleRestoreBackup = (backup: AppData) => {
        setAndSave(backup);
        const restoredRegister = backup.event.registers.find(
            (register) => register.id === backup.event.currentRegisterId
        );
        setSelectedValues(restoredRegister?.expectedValues ?? []);
        setFilterColumn(restoredRegister?.expectedColumn ?? '');
        setShowMissedEarlier(false);
        closeDialog();
    };

    const handleInstall = async () => {
        if (!installPrompt) {
            setDialog({ type: 'install' });
            return;
        }

        try {
            await installPrompt.prompt();
            const result = await installPrompt.userChoice;
            if (result.outcome === 'accepted') setInstallPrompt(null);
        } catch (error) {
            setActionError(`The install prompt could not open: ${errorMessage(error)}`);
        }
    };

    const exportBackup = () => {
        if (!data) return;
        downloadFile(
            JSON.stringify(data, null, 2),
            `gatebook-backup-${safeFileName(data.event.name)}.json`,
            'application/json'
        );
        setBackupMenuOpen(false);
    };

    const exportCsv = () => {
        if (!data) return;
        const registerColumns = data.event.registers.map(
            (register) => `Register · ${register.label}`
        );
        const rows = [
            ['Name', 'Email', ...data.headers, ...registerColumns],
            ...data.roster.map((attendee) => [
                getAttendeeName(attendee),
                getAttendeeEmail(attendee),
                ...data.headers.map((header) => attendee.values[header] ?? ''),
                ...data.event.registers.map((register) => {
                    const expected = register.attendees.some((person) => person.id === attendee.id);
                    return !expected
                        ? 'Not on roster'
                        : register.checkIns[attendee.id]
                          ? 'Here'
                          : register.notHere[attendee.id]
                            ? 'Not here'
                            : 'No mark';
                })
            ])
        ];
        const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
        downloadFile(
            `\uFEFF${csv}`,
            `gatebook-registers-${safeFileName(data.event.name)}.csv`,
            'text/csv;charset=utf-8'
        );
        setBackupMenuOpen(false);
    };

    if (!data) {
        return (
            <main className="app-shell app-loading" aria-live="polite">
                <div className="loading-mark" aria-hidden="true">
                    <CheckIcon size={22} weight="bold" />
                </div>
                <p>Opening your local register…</p>
            </main>
        );
    }

    const currentCheckedIn = expectedAttendees.reduce(
        (total, attendee) => total + Number(Boolean(currentRegister?.checkIns[attendee.id])),
        0
    );
    const currentNotHere = expectedAttendees.reduce(
        (total, attendee) => total + Number(Boolean(currentRegister?.notHere[attendee.id])),
        0
    );
    const currentUndecided = Math.max(
        0,
        expectedAttendees.length - currentCheckedIn - currentNotHere
    );
    const checkedInPercent =
        expectedAttendees.length > 0 ? (currentCheckedIn / expectedAttendees.length) * 100 : 0;
    const notHerePercent =
        expectedAttendees.length > 0 ? (currentNotHere / expectedAttendees.length) * 100 : 0;
    const selectedFilterLabel =
        selectedValues.length > 0
            ? `${selectedValues.length} ${filterColumn || 'column'} value${selectedValues.length === 1 ? '' : 's'}`
            : 'Any value';

    return (
        <main className="app-shell">
            <header className="topbar">
                <a className="brand" href={import.meta.env.BASE_URL} aria-label="Gatebook home">
                    <span className="brand-mark" aria-hidden="true">
                        <CheckIcon size={19} weight="bold" />
                    </span>
                    <span className="brand-name">Gatebook</span>
                </a>
                <div className="topbar-actions">
                    <span className={`connection-status ${isOnline ? '' : 'is-offline'}`}>
                        <span className="status-dot" aria-hidden="true" />
                        {isOnline
                            ? serviceWorkerReady
                                ? 'Offline ready'
                                : 'Preparing offline'
                            : 'Offline'}
                    </span>
                    <button
                        className="button button-outline button-small"
                        onClick={() => void handleInstall()}
                    >
                        {installed ? 'Installed' : 'Install app'}
                    </button>
                </div>
            </header>

            <div className="workspace">
                {storageError && (
                    <div className="notice notice-danger" role="alert">
                        <strong>Local save needs attention.</strong> {storageError}
                    </div>
                )}
                {actionError && (
                    <div className="notice notice-warning" role="status">
                        {actionError}
                        <button
                            type="button"
                            aria-label="Dismiss message"
                            className="notice-close"
                            onClick={() => setActionError('')}
                        >
                            <XIcon size={16} />
                        </button>
                    </div>
                )}
                {!serviceWorkerReady && isOnline && (
                    <p className="offline-hint">
                        <WifiSlashIcon size={15} weight="bold" />
                        Keep this page open while it prepares for offline use.
                    </p>
                )}

                <section className="event-heading" aria-labelledby="event-name">
                    <div className="event-title-block">
                        <div className="event-title-line">
                            <h1 id="event-name">{data.event.name}</h1>
                            <button
                                type="button"
                                className="icon-button"
                                onClick={() => setDialog({ type: 'rename-event' })}
                                aria-label="Rename event"
                                title="Rename event"
                            >
                                <PencilSimpleIcon size={17} />
                            </button>
                        </div>
                        <p>
                            {currentRegister?.label ?? 'Current register'}
                            <span className="event-dot" aria-hidden="true">
                                ·
                            </span>
                            {formatDate(currentRegister?.startedAt)}
                        </p>
                    </div>
                    <div className="event-actions">
                        <button
                            type="button"
                            className="button button-outline"
                            onClick={() => setDialog({ type: 'new-event' })}
                        >
                            <ArrowCounterClockwiseIcon size={18} />
                            New event
                        </button>
                    </div>
                </section>

                {priorRegisters.length > 0 && (
                    <section className="history-strip" aria-label="Earlier register note">
                        <span className="history-icon" aria-hidden="true">
                            <ClockCounterClockwiseIcon size={18} />
                        </span>
                        <p>
                            <strong>{missedPeopleCount} people</strong> were not checked in at an
                            earlier register.
                            {priorRegisters.length > 0 && (
                                <span className="history-latest">
                                    {' '}
                                    Last: {priorRegisters[priorRegisters.length - 1]?.label}.
                                </span>
                            )}
                        </p>
                        <button
                            type="button"
                            className={`button button-quiet button-small ${showMissedEarlier ? 'is-selected' : ''}`}
                            onClick={() => setShowMissedEarlier((value) => !value)}
                        >
                            {showMissedEarlier ? 'Show everyone' : 'See who missed'}
                        </button>
                    </section>
                )}

                <section className="register-progress" aria-label="Current register progress">
                    <div className="progress-copy">
                        <div className="attendance-totals">
                            <span className="tally-present">
                                <strong>{currentCheckedIn}</strong> checked in
                            </span>
                            <span className="tally-divider">/</span>
                            <span>
                                <strong>{expectedAttendees.length}</strong> expected
                            </span>
                            <span className="tally-not-here">
                                <strong>{currentNotHere}</strong> not here
                            </span>
                            <span className="tally-undecided">
                                <strong>{currentUndecided}</strong> still to decide
                            </span>
                        </div>
                        <span className="save-status" role="status">
                            <span
                                className={`status-dot ${saveState === 'error' ? 'dot-error' : ''}`}
                            />
                            {saveState === 'saving'
                                ? 'Saving on this device…'
                                : saveState === 'error'
                                  ? 'Not saved'
                                  : 'Saved on this device'}
                        </span>
                    </div>
                    <p className="tally-context">
                        {selectedValues.length > 0
                            ? `Expected from selected ${filterColumn} values · text search only narrows the list.`
                            : 'Expected from the full roster · text search only narrows the list.'}{' '}
                        Not here means do not wait.
                    </p>
                    <div
                        className="progress-track"
                        role="progressbar"
                        aria-label="Attendance decisions recorded"
                        aria-valuemin={0}
                        aria-valuemax={expectedAttendees.length}
                        aria-valuenow={currentCheckedIn + currentNotHere}
                    >
                        <span
                            className="progress-present"
                            style={{ width: `${checkedInPercent}%` }}
                        />
                        <span
                            className="progress-not-here"
                            style={{ width: `${notHerePercent}%` }}
                        />
                    </div>
                </section>

                <section className="roster-toolbar" aria-label="Roster tools">
                    <button
                        type="button"
                        className="button button-primary"
                        onClick={() => setDialog({ type: 'next-register' })}
                        disabled={data.roster.length === 0}
                    >
                        <PlusIcon size={18} weight="bold" />
                        Start next register
                    </button>
                    <button
                        type="button"
                        className="button button-outline"
                        onClick={() => setDialog({ type: 'history' })}
                        disabled={priorRegisters.length === 0}
                    >
                        <ClockCounterClockwiseIcon size={18} />
                        Register history
                        {priorRegisters.length > 0 && (
                            <span className="button-count">{priorRegisters.length}</span>
                        )}
                    </button>
                    <button
                        type="button"
                        className="button button-outline"
                        onClick={() => setDialog({ type: 'import' })}
                    >
                        <UploadSimpleIcon size={18} />
                        Import .xlsx
                    </button>
                    <button
                        type="button"
                        className="button button-outline"
                        onClick={() => setDialog({ type: 'attendee', attendeeId: null })}
                        disabled={data.headers.length === 0}
                    >
                        <UsersIcon size={18} />
                        Add person
                    </button>
                    <div className="backup-menu-wrap">
                        <button
                            type="button"
                            className="button button-quiet"
                            aria-haspopup="menu"
                            aria-expanded={backupMenuOpen}
                            onClick={() => setBackupMenuOpen((open) => !open)}
                        >
                            <DownloadSimpleIcon size={18} />
                            Backup & export
                        </button>
                        {backupMenuOpen && (
                            <div className="backup-menu" role="menu">
                                <button type="button" role="menuitem" onClick={exportBackup}>
                                    <FileArrowDownIcon size={18} />
                                    Download full backup
                                    <span>JSON</span>
                                </button>
                                <button type="button" role="menuitem" onClick={exportCsv}>
                                    <ArrowDownIcon size={18} />
                                    Export register results
                                    <span>CSV</span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setBackupMenuOpen(false);
                                        setDialog({ type: 'restore' });
                                    }}
                                >
                                    <ArrowCounterClockwiseIcon size={18} />
                                    Restore a backup
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                <section className="roster-section" aria-labelledby="roster-heading">
                    <div className="roster-heading">
                        <div>
                            <h2 id="roster-heading">Attendee register</h2>
                            <p>
                                {filteredAttendees.length === data.roster.length
                                    ? `${data.roster.length} people`
                                    : `${filteredAttendees.length} of ${data.roster.length} people`}
                                {data.sourceFile && (
                                    <span className="source-name"> · {data.sourceFile}</span>
                                )}
                            </p>
                        </div>
                        {data.roster.length > 0 && (
                            <button
                                type="button"
                                className={`button button-outline button-small ${showFilterMenu ? 'is-selected' : ''}`}
                                aria-expanded={showFilterMenu}
                                onClick={() => {
                                    if (!filterColumn && data.headers[0]) {
                                        changeFilterColumn(data.headers[0]);
                                    }
                                    setShowFilterMenu((open) => !open);
                                }}
                            >
                                <SlidersHorizontalIcon size={17} />
                                Filter
                                {selectedValues.length > 0 && (
                                    <span className="button-count">{selectedValues.length}</span>
                                )}
                            </button>
                        )}
                    </div>

                    {data.roster.length > 0 && (
                        <div className="search-and-filters">
                            <label className="search-field">
                                <MagnifyingGlassIcon size={20} aria-hidden="true" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(event) => setSearch(event.currentTarget.value)}
                                    placeholder="Search name or email"
                                    aria-label="Search attendee by name or email"
                                    autoComplete="off"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        className="clear-search"
                                        aria-label="Clear search"
                                        onClick={() => setSearch('')}
                                    >
                                        <XIcon size={17} />
                                    </button>
                                )}
                            </label>
                            {showFilterMenu && (
                                <div className="filter-popover">
                                    <div className="filter-popover-heading">
                                        <strong>Filter the roster</strong>
                                        <button
                                            type="button"
                                            className="icon-button"
                                            aria-label="Close filters"
                                            onClick={() => setShowFilterMenu(false)}
                                        >
                                            <XIcon size={17} />
                                        </button>
                                    </div>
                                    <label className="field-label" htmlFor="filter-column">
                                        Column
                                    </label>
                                    <select
                                        id="filter-column"
                                        value={filterColumn || data.headers[0] || ''}
                                        onChange={(event) => {
                                            changeFilterColumn(event.currentTarget.value);
                                            setFilterSearch('');
                                            setShowMoreFilters(false);
                                        }}
                                        disabled={data.headers.length === 0}
                                    >
                                        {data.headers.map((header) => (
                                            <option key={header} value={header}>
                                                {header}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="filter-values-heading">
                                        <span>{selectedFilterLabel}</span>
                                        <button
                                            type="button"
                                            onClick={() => changeSelectedValues([])}
                                            disabled={selectedValues.length === 0}
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <input
                                        className="filter-value-search"
                                        type="search"
                                        value={filterSearch}
                                        onChange={(event) => {
                                            setFilterSearch(event.currentTarget.value);
                                            setShowMoreFilters(false);
                                        }}
                                        placeholder="Find a value"
                                        aria-label="Search filter values"
                                    />
                                    {data.headers.length === 0 ? (
                                        <p className="filter-empty">
                                            Import a roster to filter its columns.
                                        </p>
                                    ) : visibleFilterValues.length === 0 ? (
                                        <p className="filter-empty">No values match that search.</p>
                                    ) : (
                                        <div className="filter-values-list">
                                            {visibleFilterValues.map((value) => {
                                                const count = data.roster.filter(
                                                    (attendee) =>
                                                        (attendee.values[filterColumn] ||
                                                            EMPTY_VALUE) === value
                                                ).length;
                                                return (
                                                    <label className="filter-value" key={value}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedValues.includes(value)}
                                                            onChange={() =>
                                                                changeSelectedValues(
                                                                    selectedValues.includes(value)
                                                                        ? selectedValues.filter(
                                                                              (item) =>
                                                                                  item !== value
                                                                          )
                                                                        : [...selectedValues, value]
                                                                )
                                                            }
                                                        />
                                                        <span>{displayFilterValue(value)}</span>
                                                        <small>{count}</small>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {uniqueValues.length > visibleFilterValues.length &&
                                        !showMoreFilters && (
                                            <button
                                                type="button"
                                                className="show-more-values"
                                                onClick={() => setShowMoreFilters(true)}
                                            >
                                                Show more values
                                            </button>
                                        )}
                                    <p className="filter-footnote">
                                        People matching any selected value will be shown.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {(selectedValues.length > 0 || showMissedEarlier) && (
                        <div className="active-filter-row">
                            {selectedValues.length > 0 && (
                                <span className="filter-chip">
                                    {filterColumn}: {selectedFilterLabel}
                                    <button
                                        type="button"
                                        aria-label="Clear column value filter"
                                        onClick={() => changeSelectedValues([])}
                                    >
                                        <XIcon size={14} />
                                    </button>
                                </span>
                            )}
                            {showMissedEarlier && (
                                <span className="filter-chip missed-chip">
                                    Missed an earlier register
                                    <button
                                        type="button"
                                        aria-label="Clear earlier absence filter"
                                        onClick={() => setShowMissedEarlier(false)}
                                    >
                                        <XIcon size={14} />
                                    </button>
                                </span>
                            )}
                            <button
                                type="button"
                                className="clear-all-filters"
                                onClick={() => {
                                    changeSelectedValues([]);
                                    setShowMissedEarlier(false);
                                    setSearch('');
                                }}
                            >
                                Clear all
                            </button>
                        </div>
                    )}

                    {data.roster.length === 0 ? (
                        <div className="empty-roster">
                            <div className="empty-mark" aria-hidden="true">
                                <UsersIcon size={25} />
                            </div>
                            <h3>Your roster goes here</h3>
                            <p>
                                Import an .xlsx file to start checking people in. It stays on this
                                device.
                            </p>
                            <button
                                type="button"
                                className="button button-primary"
                                onClick={() => setDialog({ type: 'import' })}
                            >
                                <UploadSimpleIcon size={18} />
                                Import your spreadsheet
                            </button>
                        </div>
                    ) : filteredAttendees.length === 0 ? (
                        <div className="empty-roster empty-results">
                            <h3>No people match</h3>
                            <p>Try a different search or clear the current filters.</p>
                            <button
                                type="button"
                                className="button button-outline"
                                onClick={() => {
                                    setSearch('');
                                    changeSelectedValues([]);
                                    setShowMissedEarlier(false);
                                }}
                            >
                                Clear search and filters
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="attendee-list" aria-live="polite">
                                {filteredAttendees.slice(0, visibleCount).map((attendee) => {
                                    const checkedIn = Boolean(
                                        currentRegister?.checkIns[attendee.id]
                                    );
                                    const markedNotHere = Boolean(
                                        currentRegister?.notHere[attendee.id]
                                    );
                                    const missed = missedRegistersById.get(attendee.id) ?? [];
                                    const email = getAttendeeEmail(attendee);
                                    const missedSummary = missed
                                        .map(
                                            ({ label, status }) =>
                                                `${status === 'not-here' ? 'Not here' : 'No mark'} at ${label}`
                                        )
                                        .join('; ');

                                    return (
                                        <article
                                            className={`attendee-row ${checkedIn ? 'is-checked-in' : ''} ${markedNotHere ? 'is-not-here' : ''}`}
                                            key={attendee.id}
                                        >
                                            <div className="attendee-details">
                                                <div className="attendee-name-line">
                                                    <h3>{getAttendeeName(attendee)}</h3>
                                                    {missed.length > 0 && (
                                                        <span
                                                            className={`missed-badge ${missed.length === 1 && missed[0]?.status === 'not-here' ? 'missed-not-here' : ''}`}
                                                            title={missedSummary}
                                                        >
                                                            {missed.length === 1
                                                                ? `${missed[0]?.status === 'not-here' ? 'Not here' : 'No mark'} · ${missed[0]?.label}`
                                                                : `Not in ${missed.length} registers`}
                                                        </span>
                                                    )}
                                                </div>
                                                {email && <p className="attendee-email">{email}</p>}
                                                {data.headers.length > 0 && (
                                                    <p className="attendee-detail">
                                                        {data.headers
                                                            .filter((header) => {
                                                                const lower =
                                                                    header.toLocaleLowerCase();
                                                                return (
                                                                    !/email|name/.test(lower) &&
                                                                    attendee.values[header]?.trim()
                                                                );
                                                            })
                                                            .slice(0, 2)
                                                            .map(
                                                                (header) =>
                                                                    `${header}: ${attendee.values[header]}`
                                                            )
                                                            .join('  ·  ')}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="attendee-actions">
                                                <div
                                                    className="attendance-choice-group"
                                                    role="group"
                                                    aria-label={`${getAttendeeName(attendee)} attendance status`}
                                                >
                                                    <button
                                                        type="button"
                                                        className={`attendance-choice here-choice ${checkedIn ? 'is-active' : ''}`}
                                                        onClick={() =>
                                                            handleToggleCheckIn(attendee.id)
                                                        }
                                                        aria-pressed={checkedIn}
                                                        aria-label={
                                                            checkedIn
                                                                ? `Clear here status for ${getAttendeeName(attendee)}`
                                                                : `Mark ${getAttendeeName(attendee)} here`
                                                        }
                                                    >
                                                        <CheckIcon size={17} weight="bold" />
                                                        Here
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`attendance-choice not-here-choice ${markedNotHere ? 'is-active' : ''}`}
                                                        onClick={() =>
                                                            handleToggleNotHere(attendee.id)
                                                        }
                                                        aria-pressed={markedNotHere}
                                                        aria-label={
                                                            markedNotHere
                                                                ? `Clear not here status for ${getAttendeeName(attendee)}`
                                                                : `Mark ${getAttendeeName(attendee)} not here`
                                                        }
                                                    >
                                                        Not here
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="icon-button edit-attendee"
                                                    aria-label={`Edit ${getAttendeeName(attendee)}`}
                                                    title="Edit attendee"
                                                    onClick={() =>
                                                        setDialog({
                                                            type: 'attendee',
                                                            attendeeId: attendee.id
                                                        })
                                                    }
                                                >
                                                    <PencilSimpleIcon size={17} />
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                            {filteredAttendees.length > visibleCount && (
                                <button
                                    type="button"
                                    className="load-more-button"
                                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                                >
                                    Show{' '}
                                    {Math.min(PAGE_SIZE, filteredAttendees.length - visibleCount)}{' '}
                                    more
                                    <span>
                                        {visibleCount} of {filteredAttendees.length}
                                    </span>
                                </button>
                            )}
                        </>
                    )}
                </section>

                <footer className="app-footer">
                    <span>Roster and check-ins are stored in this browser only.</span>
                    <button type="button" onClick={exportBackup}>
                        Download a backup
                    </button>
                </footer>
            </div>

            {dialog?.type === 'new-event' && (
                <EventDialog
                    mode="new"
                    currentName={data.event.name}
                    onClose={closeDialog}
                    onSubmit={handleStartNewEvent}
                />
            )}
            {dialog?.type === 'rename-event' && (
                <EventDialog
                    mode="rename"
                    currentName={data.event.name}
                    onClose={closeDialog}
                    onSubmit={(name) => {
                        updateData((current) => ({
                            ...current,
                            event: { ...current.event, name }
                        }));
                        closeDialog();
                    }}
                />
            )}
            {dialog?.type === 'next-register' && (
                <NextRegisterDialog
                    registerCount={data.event.registers.length}
                    currentLabel={currentRegister?.label ?? 'Current register'}
                    attendeeCount={expectedAttendees.length}
                    checkedInCount={currentCheckedIn}
                    notHereCount={currentNotHere}
                    undecidedCount={currentUndecided}
                    onClose={closeDialog}
                    onSubmit={handleStartNextRegister}
                />
            )}
            {dialog?.type === 'attendee' && (
                <AttendeeDialog
                    headers={data.headers}
                    attendee={data.roster.find((person) => person.id === dialog.attendeeId)}
                    onClose={closeDialog}
                    onSave={handleSaveAttendee}
                    onRemove={handleRemoveAttendee}
                />
            )}
            {dialog?.type === 'import' && (
                <ImportDialog
                    hasExistingData={
                        data.roster.length > 0 ||
                        priorRegisters.length > 0 ||
                        Object.keys(currentRegister?.checkIns ?? {}).length > 0
                    }
                    currentRosterCount={data.roster.length}
                    onClose={closeDialog}
                    onImport={handleImportRoster}
                />
            )}
            {dialog?.type === 'restore' && (
                <RestoreDialog onClose={closeDialog} onRestore={handleRestoreBackup} />
            )}
            {dialog?.type === 'history' && (
                <RegisterHistoryDialog registers={priorRegisters} onClose={closeDialog} />
            )}
            {dialog?.type === 'install' && <InstallDialog onClose={closeDialog} />}
        </main>
    );
}

function EventDialog({
    mode,
    currentName,
    onClose,
    onSubmit
}: {
    mode: 'new' | 'rename';
    currentName: string;
    onClose: () => void;
    onSubmit: (name: string) => void;
}) {
    const [name, setName] = useState(mode === 'new' ? '' : currentName);
    const [error, setError] = useState('');

    return (
        <Modal title={mode === 'new' ? 'Start a new event' : 'Rename event'} onClose={onClose}>
            <form
                className="dialog-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!name.trim()) {
                        setError('Add an event name to continue.');
                        return;
                    }
                    onSubmit(name.trim());
                }}
            >
                {mode === 'new' && (
                    <p className="dialog-copy">
                        This clears the current event’s register history and check-ins. Your roster
                        stays on this device.
                    </p>
                )}
                <label className="field-label" htmlFor="event-name-input">
                    Event name
                </label>
                <input
                    id="event-name-input"
                    autoFocus
                    value={name}
                    onChange={(event) => {
                        setName(event.currentTarget.value);
                        setError('');
                    }}
                    placeholder="e.g. Community open day"
                    maxLength={100}
                />
                {error && (
                    <p className="field-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="dialog-actions">
                    <button type="button" className="button button-quiet" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button button-primary">
                        {mode === 'new' ? 'Start new event' : 'Save event name'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function NextRegisterDialog({
    registerCount,
    currentLabel,
    attendeeCount,
    checkedInCount,
    notHereCount,
    undecidedCount,
    onClose,
    onSubmit
}: {
    registerCount: number;
    currentLabel: string;
    attendeeCount: number;
    checkedInCount: number;
    notHereCount: number;
    undecidedCount: number;
    onClose: () => void;
    onSubmit: (label: string) => void;
}) {
    const [label, setLabel] = useState(`Register ${registerCount + 1}`);
    const [error, setError] = useState('');

    return (
        <Modal title="Finish this register" onClose={onClose}>
            <form
                className="dialog-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!label.trim()) {
                        setError('Give this register a name.');
                        return;
                    }
                    onSubmit(label.trim());
                }}
            >
                <p className="dialog-copy">
                    Save <strong>{currentLabel}</strong>: {checkedInCount} here, {notHereCount}{' '}
                    marked not here, {undecidedCount} still to decide, out of {attendeeCount}{' '}
                    expected. The next register starts with a clean attendance status.
                </p>
                <label className="field-label" htmlFor="register-label">
                    Name the next register
                </label>
                <input
                    id="register-label"
                    autoFocus
                    value={label}
                    onChange={(event) => {
                        setLabel(event.currentTarget.value);
                        setError('');
                    }}
                    placeholder="e.g. Afternoon check"
                    maxLength={80}
                />
                {error && (
                    <p className="field-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="dialog-actions">
                    <button type="button" className="button button-quiet" onClick={onClose}>
                        Keep checking in
                    </button>
                    <button type="submit" className="button button-primary">
                        Save & start next
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function AttendeeDialog({
    headers,
    attendee,
    onClose,
    onSave,
    onRemove
}: {
    headers: string[];
    attendee?: Attendee;
    onClose: () => void;
    onSave: (attendee: Attendee) => void;
    onRemove: (id: string) => void;
}) {
    const [error, setError] = useState('');

    return (
        <Modal title={attendee ? 'Edit attendee' : 'Add attendee'} onClose={onClose}>
            <form
                className="dialog-form attendee-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    const values = Object.fromEntries(
                        headers.map((header, index) => [
                            header,
                            String(formData.get(`attendee-${index}`) ?? '').trim()
                        ])
                    );
                    if (!Object.values(values).some(Boolean)) {
                        setError('Add at least one attendee detail.');
                        return;
                    }

                    onSave({ id: attendee?.id ?? createId(), values });
                }}
            >
                <p className="dialog-copy">
                    Details use the same columns as your imported spreadsheet.
                </p>
                <div className="attendee-fields">
                    {headers.map((header, index) => (
                        <label className="field-label" key={`${header}-${index}`}>
                            {header}
                            <input
                                name={`attendee-${index}`}
                                defaultValue={attendee?.values[header] ?? ''}
                                autoFocus={index === 0}
                            />
                        </label>
                    ))}
                </div>
                {error && (
                    <p className="field-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="dialog-actions dialog-actions-between">
                    {attendee ? (
                        <button
                            type="button"
                            className="button button-danger-quiet"
                            onClick={() => {
                                if (
                                    window.confirm(
                                        `Remove ${getAttendeeName(attendee)} from the master roster? Completed register history will remain unchanged.`
                                    )
                                ) {
                                    onRemove(attendee.id);
                                }
                            }}
                        >
                            <TrashIcon size={17} />
                            Remove
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className="dialog-actions-end">
                        <button type="button" className="button button-quiet" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="button button-primary">
                            {attendee ? 'Save changes' : 'Add to roster'}
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}

function ImportDialog({
    hasExistingData,
    currentRosterCount,
    onClose,
    onImport
}: {
    hasExistingData: boolean;
    currentRosterCount: number;
    onClose: () => void;
    onImport: (roster: ImportedRoster, fileName: string) => void;
}) {
    const [fileName, setFileName] = useState('');
    const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [selectedSheet, setSelectedSheet] = useState('');
    const [preview, setPreview] = useState<ImportedRoster | null>(null);
    const [error, setError] = useState('');
    const [confirmReplace, setConfirmReplace] = useState(false);

    const handleFile = async (file?: File) => {
        setPreview(null);
        setError('');
        setConfirmReplace(false);
        if (!file) return;
        if (!file.name.toLocaleLowerCase().endsWith('.xlsx')) {
            setError('Choose an .xlsx workbook.');
            return;
        }

        try {
            const fileBuffer = await file.arrayBuffer();
            const sheets = getWorkbookSheets(fileBuffer);
            if (sheets.length === 0) throw new Error('No worksheets were found in this workbook.');
            setBuffer(fileBuffer);
            setFileName(file.name);
            setSheetNames(sheets);
            setSelectedSheet(sheets[0] ?? '');
            setPreview(parseWorkbookSheet(fileBuffer, sheets[0] ?? ''));
        } catch (cause) {
            setError(`Could not read this spreadsheet: ${errorMessage(cause)}`);
        }
    };

    const previewSelectedSheet = () => {
        if (!buffer) return;
        try {
            setError('');
            setPreview(parseWorkbookSheet(buffer, selectedSheet));
            setConfirmReplace(false);
        } catch (cause) {
            setPreview(null);
            setError(`Could not read this worksheet: ${errorMessage(cause)}`);
        }
    };

    return (
        <Modal title="Import spreadsheet" onClose={onClose}>
            <div className="dialog-form">
                <p className="dialog-copy">
                    Your workbook is read on this device. The first row of the selected worksheet is
                    used for column headings.
                </p>
                <label className="file-picker">
                    <UploadSimpleIcon size={20} />
                    <span>{fileName || 'Choose an .xlsx file'}</span>
                    <input
                        type="file"
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={(event) => void handleFile(event.currentTarget.files?.[0])}
                    />
                </label>
                {sheetNames.length > 1 && (
                    <div className="sheet-picker">
                        <label className="field-label" htmlFor="sheet-name">
                            Worksheet
                        </label>
                        <div className="sheet-picker-row">
                            <select
                                id="sheet-name"
                                value={selectedSheet}
                                onChange={(event) => {
                                    setSelectedSheet(event.currentTarget.value);
                                    setPreview(null);
                                    setConfirmReplace(false);
                                }}
                            >
                                {sheetNames.map((name) => (
                                    <option key={name}>{name}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="button button-outline"
                                onClick={previewSelectedSheet}
                            >
                                Preview
                            </button>
                        </div>
                    </div>
                )}
                {preview && (
                    <div className="import-preview">
                        <strong>{preview.attendees.length.toLocaleString()} people found</strong>
                        <span>
                            {preview.headers.length} columns · {selectedSheet}
                        </span>
                        <div className="preview-table">
                            <div className="preview-row preview-header">
                                {preview.headers.slice(0, 4).map((header) => (
                                    <span key={header}>{header}</span>
                                ))}
                            </div>
                            {preview.attendees.slice(0, 3).map((attendee) => (
                                <div className="preview-row" key={attendee.id}>
                                    {preview.headers.slice(0, 4).map((header) => (
                                        <span key={header}>{attendee.values[header]}</span>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {hasExistingData && (
                    <p className="replace-warning">
                        Importing replaces the current roster
                        {currentRosterCount > 0 ? ` of ${currentRosterCount} people` : ''} and
                        clears this event’s register history.
                    </p>
                )}
                {error && (
                    <p className="field-error" role="alert">
                        {error}
                    </p>
                )}
                {confirmReplace && (
                    <div className="replace-confirm" role="alert">
                        <strong>Replace the roster and event history?</strong>
                        <span>This cannot be undone unless you have a backup.</span>
                    </div>
                )}
                <div className="dialog-actions">
                    <button type="button" className="button button-quiet" onClick={onClose}>
                        Cancel
                    </button>
                    {preview && hasExistingData && !confirmReplace && (
                        <button
                            type="button"
                            className="button button-primary"
                            onClick={() => setConfirmReplace(true)}
                        >
                            Continue to replace
                        </button>
                    )}
                    {preview && (!hasExistingData || confirmReplace) && (
                        <button
                            type="button"
                            className={`button ${confirmReplace ? 'button-danger' : 'button-primary'}`}
                            onClick={() => onImport(preview, fileName)}
                        >
                            {confirmReplace
                                ? 'Replace roster & history'
                                : `Import ${preview.attendees.length.toLocaleString()} people`}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function RestoreDialog({
    onClose,
    onRestore
}: {
    onClose: () => void;
    onRestore: (backup: AppData) => void;
}) {
    const [candidate, setCandidate] = useState<{ data: AppData; fileName: string } | null>(null);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState(false);

    const handleFile = async (file?: File) => {
        setCandidate(null);
        setError('');
        setConfirm(false);
        if (!file) return;

        try {
            const parsed: unknown = JSON.parse(await file.text());
            if (!isAppData(parsed)) {
                throw new Error('This file is not a valid Gatebook backup.');
            }
            setCandidate({ data: parsed, fileName: file.name });
        } catch (cause) {
            setError(errorMessage(cause));
        }
    };

    return (
        <Modal title="Restore a backup" onClose={onClose}>
            <div className="dialog-form">
                <p className="dialog-copy">
                    Choose a Gatebook JSON backup. Restoring replaces the roster, event, and all
                    register results on this device.
                </p>
                <label className="file-picker">
                    <FileArrowDownIcon size={20} />
                    <span>{candidate?.fileName ?? 'Choose a Gatebook backup'}</span>
                    <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(event) => void handleFile(event.currentTarget.files?.[0])}
                    />
                </label>
                {candidate && (
                    <div className="import-preview restore-preview">
                        <strong>{candidate.data.event.name}</strong>
                        <span>
                            {candidate.data.roster.length.toLocaleString()} people ·{' '}
                            {candidate.data.event.registers.length} registers
                        </span>
                    </div>
                )}
                {error && (
                    <p className="field-error" role="alert">
                        {error}
                    </p>
                )}
                {confirm && (
                    <div className="replace-confirm" role="alert">
                        <strong>Replace the data on this device?</strong>
                        <span>
                            Make a backup of the current event first if you need to keep it.
                        </span>
                    </div>
                )}
                <div className="dialog-actions">
                    <button type="button" className="button button-quiet" onClick={onClose}>
                        Cancel
                    </button>
                    {candidate && !confirm && (
                        <button
                            type="button"
                            className="button button-primary"
                            onClick={() => setConfirm(true)}
                        >
                            Review replacement
                        </button>
                    )}
                    {candidate && confirm && (
                        <button
                            type="button"
                            className="button button-danger"
                            onClick={() => onRestore(candidate.data)}
                        >
                            Restore backup
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function RegisterHistoryDialog({
    registers,
    onClose
}: {
    registers: EventRegister[];
    onClose: () => void;
}) {
    const [filter, setFilter] = useState('');
    const matchingRegisters = [...registers]
        .reverse()
        .filter((register) =>
            register.label.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
        );

    return (
        <Modal title="Register history" onClose={onClose}>
            <div className="dialog-form history-dialog">
                <p className="dialog-copy">
                    Each saved register is a snapshot. People missing from earlier rounds stay
                    flagged in the current attendee list.
                </p>
                {registers.length > 2 && (
                    <input
                        type="search"
                        value={filter}
                        onChange={(event) => setFilter(event.currentTarget.value)}
                        placeholder="Find a register"
                        aria-label="Find a register by name"
                    />
                )}
                <div className="register-history-list">
                    {matchingRegisters.map((register) => {
                        const present = register.attendees.filter((attendee) =>
                            Boolean(register.checkIns[attendee.id])
                        );
                        const notHere = register.attendees.filter((attendee) =>
                            Boolean(register.notHere[attendee.id])
                        );
                        const unmarked = register.attendees.filter(
                            (attendee) =>
                                !register.checkIns[attendee.id] && !register.notHere[attendee.id]
                        );
                        const expectedLabel =
                            register.expectedValues.length > 0
                                ? `${register.expectedColumn} · ${register.expectedValues.length} selected`
                                : 'Full roster';

                        return (
                            <details className="history-item" key={register.id}>
                                <summary>
                                    <span className="history-item-name">
                                        <strong>{register.label}</strong>
                                        <small>
                                            {formatDate(register.completedAt ?? register.startedAt)}
                                        </small>
                                    </span>
                                    <span className="history-item-count">
                                        {present.length} here · {notHere.length} not here ·{' '}
                                        {unmarked.length} no mark
                                    </span>
                                </summary>
                                <div className="history-result">
                                    <p className="history-scope">Expected: {expectedLabel}</p>
                                    <HistoryGroup title="Here" people={present} />
                                    <HistoryGroup title="Marked not here" people={notHere} />
                                    <HistoryGroup title="No status recorded" people={unmarked} />
                                </div>
                            </details>
                        );
                    })}
                    {matchingRegisters.length === 0 && (
                        <p className="history-no-results">No saved register matches that name.</p>
                    )}
                </div>
                <div className="dialog-actions">
                    <button type="button" className="button button-primary" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function HistoryGroup({ title, people }: { title: string; people: HistoricalAttendee[] }) {
    return (
        <section className="history-group">
            <h3>
                {title} ({people.length})
            </h3>
            {people.length === 0 ? (
                <p className="history-no-results">None</p>
            ) : (
                <ul>
                    {people.slice(0, 100).map((attendee) => (
                        <li key={attendee.id}>
                            {attendee.name}
                            {attendee.email && <span>{attendee.email}</span>}
                        </li>
                    ))}
                </ul>
            )}
            {people.length > 100 && (
                <p className="history-limit">
                    Showing 100 of {people.length}. Export register results for the full list.
                </p>
            )}
        </section>
    );
}

function InstallDialog({ onClose }: { onClose: () => void }) {
    const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent);

    return (
        <Modal title="Install Gatebook" onClose={onClose}>
            <div className="dialog-form">
                <p className="dialog-copy">
                    Add Gatebook to your home screen so it opens like an app and can be used after
                    the first online load.
                </p>
                <ol className="install-steps">
                    {isAppleMobile ? (
                        <>
                            <li>Open this page in Safari.</li>
                            <li>
                                Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>
                                .
                            </li>
                            <li>Open Gatebook from the new home-screen icon while online once.</li>
                        </>
                    ) : (
                        <>
                            <li>Open this page in Chrome.</li>
                            <li>
                                Tap the browser menu, then <strong>Install app</strong> or{' '}
                                <strong>Add to Home screen</strong>.
                            </li>
                            <li>Open Gatebook while online once so its files are ready offline.</li>
                        </>
                    )}
                </ol>
                <p className="dialog-copy">
                    Keep the roster on this device and export a backup before clearing browser data
                    or changing devices.
                </p>
                <div className="dialog-actions">
                    <button type="button" className="button button-primary" onClick={onClose}>
                        Got it
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function Modal({
    title,
    onClose,
    children
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const node = dialogRef.current;
        if (node && !node.open) node.showModal();
        return () => {
            if (node?.open) node.close();
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className="app-dialog"
            aria-labelledby="dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <div className="dialog-heading">
                <h2 id="dialog-title">{title}</h2>
                <button
                    type="button"
                    className="icon-button"
                    aria-label="Close dialog"
                    onClick={onClose}
                >
                    <XIcon size={19} />
                </button>
            </div>
            {children}
        </dialog>
    );
}

function replaceRegister(event: AppData['event'], register: EventRegister): AppData['event'] {
    return {
        ...event,
        registers: event.registers.map((item) => (item.id === register.id ? register : item))
    };
}

function displayFilterValue(value: string): string {
    return value === EMPTY_VALUE ? '(blank)' : value;
}

function formatDate(value?: string | null): string {
    if (!value) return 'Just now';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function safeFileName(value: string): string {
    return (
        value
            .normalize('NFKD')
            .replace(/[^\w-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLocaleLowerCase() || 'event'
    );
}

function csvCell(value: string): string {
    const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replace(/"/g, '""')}"`;
}

function downloadFile(content: string, fileName: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
