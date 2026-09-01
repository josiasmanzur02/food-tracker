import { useEffect, useState } from 'react';
import type { UnitSystem, WeightEntry } from '../types';
import { convertWeightToDisplay, convertWeightToKg, formatWeightNumber } from '../utils/units';
import { ModalShell } from './ModalShell';

interface WeightSheetProps {
  open: boolean;
  unitSystem: UnitSystem;
  defaultDate: string;
  defaultWeightKg: number;
  entry?: WeightEntry | null;
  onClose: () => void;
  onSave: (input: { id?: string; date: string; weightKg: number }) => void;
}

export function WeightSheet({
  open,
  unitSystem,
  defaultDate,
  defaultWeightKg,
  entry,
  onClose,
  onSave
}: WeightSheetProps) {
  const [date, setDate] = useState(defaultDate);
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDate(entry?.date ?? defaultDate);
    setWeight(
      entry
        ? formatWeightNumber(entry.weightKg, unitSystem, 1)
        : formatWeightNumber(defaultWeightKg, unitSystem, 1)
    );
    setError(null);
  }, [defaultDate, defaultWeightKg, entry, open, unitSystem]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedWeight = Number(weight);

    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > 1400) {
      setError('Enter a valid body weight.');
      return;
    }

    onSave({
      id: entry?.id,
      date,
      weightKg: convertWeightToKg(parsedWeight, unitSystem)
    });
  }

  return (
    <ModalShell open={open} title={entry ? 'Edit Weight' : 'Log Weight'} onClose={onClose}>
      <form className="sheet-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="field">
          <span>Weight ({unitSystem === 'imperial' ? 'lb' : 'kg'})</span>
          <input
            autoFocus
            inputMode="decimal"
            type="number"
            min="0"
            step="0.1"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>
        <p className="sheet-form__hint">
          Current suggestion: {convertWeightToDisplay(defaultWeightKg, unitSystem).toFixed(1)}{' '}
          {unitSystem === 'imperial' ? 'lb' : 'kg'}
        </p>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
        <div className="sheet-actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary">
            Save Weight
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
