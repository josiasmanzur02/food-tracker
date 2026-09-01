import { lazy, startTransition, Suspense, type ReactNode, useEffect, useMemo, useState } from 'react';
import { AddCaloriesSheet } from './components/AddCaloriesSheet';
import { BottomNav } from './components/BottomNav';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FoodSearchSheet } from './components/FoodSearchSheet';
import { WeightSheet } from './components/WeightSheet';
import {
  addCalorieEntry,
  deleteCalorieEntry,
  deleteWeightEntry,
  exportData,
  getAppData,
  importData,
  parseImportData,
  resetData,
  saveProfile,
  saveSettings,
  saveWeightEntry,
  updateCalorieEntry
} from './services/storage';
import type {
  AppData,
  AppPage,
  CalorieEntry,
  ImportPreview,
  UserProfile,
  WeightEntry
} from './types';
import {
  calculateTarget,
  getDailyTarget
} from './utils/calories';
import { formatTimestampMonthYear, getDateKey } from './utils/dates';
import { getCurrentWeightKg } from './utils/weight';
import { HistoryPage } from './pages/HistoryPage';
import { OnboardingPage, type OnboardingSubmission } from './pages/OnboardingPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';

const MealScannerSheet = lazy(() => import('./components/MealScannerSheet'));

interface ConfirmState {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getPageFromHash(): AppPage {
  if (typeof window === 'undefined') {
    return 'today';
  }

  const rawHash = window.location.hash.replace(/^#\/?/, '');

  if (
    rawHash === 'today' ||
    rawHash === 'progress' ||
    rawHash === 'history' ||
    rawHash === 'settings'
  ) {
    return rawHash;
  }

  return 'today';
}

function setHashPage(page: AppPage) {
  window.location.hash = `/${page}`;
}

function downloadBackup(serializedData: string, dateKey: string) {
  const blob = new Blob([serializedData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `calorietrack-backup-${dateKey}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [appData, setAppData] = useState<AppData>(() => getAppData());
  const [activePage, setActivePage] = useState<AppPage>(() => getPageFromHash());
  const [statusMessage, setStatusMessage] = useState('');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [foodSearchOpen, setFoodSearchOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [calorieEditor, setCalorieEditor] = useState<{
    open: boolean;
    date: string;
    entry: CalorieEntry | null;
  }>({ open: false, date: getDateKey(), entry: null });
  const [weightEditor, setWeightEditor] = useState<{
    open: boolean;
    date: string;
    entry: WeightEntry | null;
  }>({ open: false, date: getDateKey(), entry: null });

  const todayDate = getDateKey();
  const profile = appData.profile;
  const currentWeightKg = profile ? getCurrentWeightKg(profile, appData.weightEntries) : 0;

  const todayEntries = useMemo(
    () => appData.calorieEntries.filter((entry) => entry.date === todayDate),
    [appData.calorieEntries, todayDate]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    function syncFromHash() {
      setActivePage(getPageFromHash());
    }

    window.addEventListener('hashchange', syncFromHash);
    syncFromHash();

    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, []);

  useEffect(() => {
    function handleOnlineStatus() {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setStatusMessage(''), 3500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [statusMessage]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme() {
      const resolvedTheme =
        appData.settings.theme === 'system'
          ? mediaQuery.matches
            ? 'dark'
            : 'light'
          : appData.settings.theme;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    }

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);

    return () => {
      mediaQuery.removeEventListener('change', applyTheme);
    };
  }, [appData.settings.theme]);

  function navigate(page: AppPage) {
    startTransition(() => {
      setActivePage(page);
      setHashPage(page);
    });
  }

  function saveNextProfile(profileUpdater: (currentProfile: UserProfile) => UserProfile) {
    if (!profile) {
      return;
    }

    const nextProfile = profileUpdater(profile);
    const nextData = saveProfile(nextProfile);
    setAppData(nextData);
  }

  function handleOnboardingComplete(submission: OnboardingSubmission) {
    const now = new Date().toISOString();
    const calculation = calculateTarget({
      age: submission.age,
      heightCm: submission.heightCm,
      sex: submission.sex,
      activityLevel: submission.activityLevel,
      currentWeightKg: submission.currentWeightKg,
      goalWeightKg: submission.goalWeightKg,
      goalRate: submission.goalRate
    });

    const newProfile: UserProfile = {
      id: createId(),
      unitSystem: submission.unitSystem,
      age: submission.age,
      heightCm: submission.heightCm,
      sex: submission.sex,
      startingWeightKg: submission.currentWeightKg,
      goalWeightKg: submission.goalWeightKg,
      activityLevel: submission.activityLevel,
      goalType: calculation.goalType,
      goalRate: submission.goalRate,
      maintenanceCalories: calculation.maintenanceCalories,
      calculatedTargetCalories: calculation.targetCalories,
      customTargetCalories: null,
      targetNotice: calculation.targetNotice,
      createdAt: now,
      updatedAt: now,
      onboardedAt: now
    };

    saveProfile(newProfile);
    const nextData = saveWeightEntry({
      date: todayDate,
      weightKg: submission.currentWeightKg
    });
    setAppData(nextData);
    setStatusMessage('Profile saved.');
  }

  function handleSaveCalorieEntry(input: {
    date: string;
    calories: number;
    description?: string;
    meal?: CalorieEntry['meal'];
  }) {
    const nextData = calorieEditor.entry
      ? updateCalorieEntry(calorieEditor.entry.id, {
          date: input.date,
          calories: input.calories,
          description: input.description,
          meal: input.meal,
          aiMetadata: calorieEditor.entry.aiMetadata
        })
      : addCalorieEntry({
          date: input.date,
          calories: input.calories,
          description: input.description,
          meal: input.meal,
          source: 'manual'
        });

    setAppData(nextData);
    setCalorieEditor({ open: false, date: todayDate, entry: null });
    setStatusMessage(calorieEditor.entry ? 'Calorie entry updated.' : 'Calorie entry saved.');
  }

  function handleDeleteEntry(entry: CalorieEntry) {
    setConfirmState({
      title: 'Delete this calorie entry?',
      message: <p>This will remove the entry from your calorie history.</p>,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => {
        const nextData = deleteCalorieEntry(entry.id);
        setAppData(nextData);
        setConfirmState(null);
        setStatusMessage('Calorie entry deleted.');
      }
    });
  }

  function handleSaveWeightEntry(input: { id?: string; date: string; weightKg: number }) {
    const nextData = saveWeightEntry(input);
    setAppData(nextData);
    setWeightEditor({ open: false, date: todayDate, entry: null });
    setStatusMessage('Weight saved.');
  }

  function handleDeleteWeight(entry: WeightEntry) {
    setConfirmState({
      title: 'Delete this weight entry?',
      message: <p>This will remove the weigh-in for {entry.date}.</p>,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: () => {
        const nextData = deleteWeightEntry(entry.id);
        setAppData(nextData);
        setConfirmState(null);
        setStatusMessage('Weight entry deleted.');
      }
    });
  }

  function handleAddMealFromScanner(input: {
    calories: number;
    description: string;
    aiMetadata: CalorieEntry['aiMetadata'];
  }) {
    const nextData = addCalorieEntry({
      date: todayDate,
      calories: input.calories,
      description: input.description,
      meal: 'other',
      source: 'ai',
      aiMetadata: input.aiMetadata
    });
    setAppData(nextData);
    setScannerOpen(false);
    setStatusMessage('AI meal added to today.');
  }

  async function handleImportFile(file: File) {
    try {
      const preview = parseImportData(await file.text());
      setPendingImport(preview);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  function handleSaveProfileSettings(input: {
    unitSystem: UserProfile['unitSystem'];
    age: number;
    heightCm: number;
    sex: UserProfile['sex'];
    activityLevel: UserProfile['activityLevel'];
  }) {
    if (!profile) {
      return;
    }

    const calculation = calculateTarget({
      age: input.age,
      heightCm: input.heightCm,
      sex: input.sex,
      activityLevel: input.activityLevel,
      currentWeightKg,
      goalWeightKg: profile.goalWeightKg,
      goalRate: profile.goalRate
    });

    saveNextProfile((currentProfile) => ({
      ...currentProfile,
      unitSystem: input.unitSystem,
      age: input.age,
      heightCm: input.heightCm,
      sex: input.sex,
      activityLevel: input.activityLevel,
      goalType: calculation.goalType,
      goalRate: calculation.goalType === 'maintain' ? null : currentProfile.goalRate,
      maintenanceCalories: calculation.maintenanceCalories,
      calculatedTargetCalories: calculation.targetCalories,
      targetNotice: calculation.targetNotice,
      updatedAt: new Date().toISOString()
    }));

    setStatusMessage(
      profile.customTargetCalories
        ? 'Profile updated. Custom daily target kept.'
        : 'Profile updated.'
    );
  }

  function handleSaveGoalSettings(input: {
    goalWeightKg: number;
    goalRate: UserProfile['goalRate'];
    customTargetCalories: number | null;
  }) {
    if (!profile) {
      return;
    }

    const calculation = calculateTarget({
      age: profile.age,
      heightCm: profile.heightCm,
      sex: profile.sex,
      activityLevel: profile.activityLevel,
      currentWeightKg,
      goalWeightKg: input.goalWeightKg,
      goalRate: input.goalRate
    });

    saveNextProfile((currentProfile) => ({
      ...currentProfile,
      goalWeightKg: input.goalWeightKg,
      goalType: calculation.goalType,
      goalRate: input.goalRate,
      maintenanceCalories: calculation.maintenanceCalories,
      calculatedTargetCalories: calculation.targetCalories,
      customTargetCalories: input.customTargetCalories,
      targetNotice: calculation.targetNotice,
      updatedAt: new Date().toISOString()
    }));

    setStatusMessage('Goal settings updated.');
  }

  function handleRecalculateTarget() {
    if (!profile) {
      return;
    }

    const calculation = calculateTarget({
      age: profile.age,
      heightCm: profile.heightCm,
      sex: profile.sex,
      activityLevel: profile.activityLevel,
      currentWeightKg,
      goalWeightKg: profile.goalWeightKg,
      goalRate: profile.goalRate
    });

    saveNextProfile((currentProfile) => ({
      ...currentProfile,
      goalType: calculation.goalType,
      goalRate: calculation.goalType === 'maintain' ? null : currentProfile.goalRate,
      maintenanceCalories: calculation.maintenanceCalories,
      calculatedTargetCalories: calculation.targetCalories,
      targetNotice: calculation.targetNotice,
      updatedAt: new Date().toISOString()
    }));

    setStatusMessage(
      profile.customTargetCalories
        ? 'Calculated estimate refreshed. Custom target still active.'
        : 'Daily target recalculated.'
    );
  }

  function handleResetCalculatedTarget() {
    if (!profile) {
      return;
    }

    saveNextProfile((currentProfile) => ({
      ...currentProfile,
      customTargetCalories: null,
      updatedAt: new Date().toISOString()
    }));

    setStatusMessage('Custom daily target removed.');
  }

  function handleThemeChange(theme: AppData['settings']['theme']) {
    const nextData = saveSettings({
      ...appData.settings,
      theme
    });
    setAppData(nextData);
    setStatusMessage(`Theme set to ${theme}.`);
  }

  function handleExport() {
    downloadBackup(exportData(), todayDate);
    setStatusMessage('Backup downloaded.');
  }

  function handleReset() {
    setConfirmState({
      title: 'Reset CalorieTrack?',
      message: (
        <p>
          This will permanently remove your calorie history, weight history and settings
          from this device.
        </p>
      ),
      confirmLabel: 'Reset Everything',
      tone: 'danger',
      onConfirm: () => {
        const nextData = resetData();
        setAppData(nextData);
        setConfirmState(null);
        setScannerOpen(false);
        setCalorieEditor({ open: false, date: todayDate, entry: null });
        setWeightEditor({ open: false, date: todayDate, entry: null });
        navigate('today');
        setStatusMessage('All local data removed.');
      }
    });
  }

  if (!profile) {
    return (
      <>
        <div className="status-banner" aria-live="polite">
          {statusMessage}
        </div>
        <OnboardingPage onComplete={handleOnboardingComplete} />
      </>
    );
  }

  const targetCalories = getDailyTarget(profile);
  const defaultWeightKg = currentWeightKg || profile.startingWeightKg;

  return (
    <>
      <div className="status-banner" aria-live="polite">
        {statusMessage}
      </div>
      <div className="app-shell">
        <main className="app-shell__content">
          {activePage === 'today' ? (
            <TodayPage
              profile={profile}
              todayDate={todayDate}
              targetCalories={targetCalories}
              currentWeightKg={currentWeightKg}
              calorieEntries={todayEntries}
              isOnline={isOnline}
              onAddCalories={() =>
                setCalorieEditor({ open: true, date: todayDate, entry: null })
              }
              onOpenMealScanner={() => setFoodSearchOpen(true)}
              onEditEntry={(entry) =>
                setCalorieEditor({ open: true, date: entry.date, entry })
              }
              onDeleteEntry={handleDeleteEntry}
              onLogWeight={() =>
                setWeightEditor({ open: true, date: todayDate, entry: null })
              }
            />
          ) : null}

          {activePage === 'progress' ? (
            <ProgressPage
              profile={profile}
              calorieEntries={appData.calorieEntries}
              weightEntries={appData.weightEntries}
            />
          ) : null}

          {activePage === 'history' ? (
            <HistoryPage
              profile={profile}
              calorieEntries={appData.calorieEntries}
              weightEntries={appData.weightEntries}
              onEditEntry={(entry) =>
                setCalorieEditor({ open: true, date: entry.date, entry })
              }
              onDeleteEntry={handleDeleteEntry}
              onEditWeight={(entry) =>
                setWeightEditor({ open: true, date: entry.date, entry })
              }
              onDeleteWeight={handleDeleteWeight}
              onLogWeight={(date) =>
                setWeightEditor({ open: true, date, entry: null })
              }
            />
          ) : null}

          {activePage === 'settings' ? (
            <SettingsPage
              profile={profile}
              settings={appData.settings}
              currentWeightKg={currentWeightKg}
              onSaveProfile={handleSaveProfileSettings}
              onSaveGoal={handleSaveGoalSettings}
              onRecalculateTarget={handleRecalculateTarget}
              onResetCalculatedTarget={handleResetCalculatedTarget}
              onChangeTheme={handleThemeChange}
              onExport={handleExport}
              onImportFile={handleImportFile}
              onResetData={handleReset}
            />
          ) : null}
        </main>

        <BottomNav activePage={activePage} onNavigate={navigate} />
      </div>

      <AddCaloriesSheet
        open={calorieEditor.open}
        date={calorieEditor.date}
        entry={calorieEditor.entry}
        onClose={() => setCalorieEditor({ open: false, date: todayDate, entry: null })}
        onSave={handleSaveCalorieEntry}
      />

      <WeightSheet
        open={weightEditor.open}
        unitSystem={profile.unitSystem}
        defaultDate={weightEditor.date}
        defaultWeightKg={defaultWeightKg}
        entry={weightEditor.entry}
        onClose={() => setWeightEditor({ open: false, date: todayDate, entry: null })}
        onSave={handleSaveWeightEntry}
      />

      <FoodSearchSheet
        open={foodSearchOpen}
        onClose={() => setFoodSearchOpen(false)}
        onAddFood={(input) => {
          const nextData = addCalorieEntry({
            date: todayDate,
            calories: input.calories,
            description: input.description,
            meal: input.meal,
            source: 'manual'
          });
          setAppData(nextData);
          setFoodSearchOpen(false);
          setStatusMessage('USDA food added.');
        }}
      />

      <Suspense fallback={scannerOpen ? <div className="status-banner">Loading scanner…</div> : null}>
        <MealScannerSheet
          open={scannerOpen}
          isOnline={isOnline}
          onClose={() => setScannerOpen(false)}
          onAddMeal={handleAddMealFromScanner}
          onAddManual={() => {
            setScannerOpen(false);
            setCalorieEditor({ open: true, date: todayDate, entry: null });
          }}
        />
      </Suspense>

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? null}
        confirmLabel={confirmState?.confirmLabel ?? 'Confirm'}
        cancelLabel={confirmState?.cancelLabel}
        tone={confirmState?.tone}
        onConfirm={confirmState?.onConfirm ?? (() => undefined)}
        onCancel={() => setConfirmState(null)}
      />

      <ConfirmDialog
        open={pendingImport !== null}
        title="Import data?"
        message={
          pendingImport ? (
            <div className="stack stack--tight">
              <p>This backup contains:</p>
              <p>{pendingImport.calorieEntryCount} calorie entries</p>
              <p>{pendingImport.weightEntryCount} weight entries</p>
              <p>
                Profile created{' '}
                {pendingImport.profileCreatedAt
                  ? formatTimestampMonthYear(pendingImport.profileCreatedAt)
                  : 'unknown date'}
              </p>
            </div>
          ) : null
        }
        confirmLabel="Import"
        onConfirm={() => {
          if (!pendingImport) {
            return;
          }

          const nextData = importData(pendingImport.data);
          setAppData(nextData);
          setPendingImport(null);
          setStatusMessage('Backup imported.');
        }}
        onCancel={() => setPendingImport(null)}
      />
    </>
  );
}
