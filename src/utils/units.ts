import type { UnitSystem } from '../types';

const KG_PER_LB = 0.45359237;

function trimTrailingZeros(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function kgToPounds(weightKg: number): number {
  return weightKg / KG_PER_LB;
}

export function poundsToKg(weightLb: number): number {
  return weightLb * KG_PER_LB;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54;
}

export function cmToFeetInches(heightCm: number): { feet: number; inches: number } {
  const totalInches = heightCm / 2.54;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);

  if (inches === 12) {
    feet += 1;
    inches = 0;
  }

  return { feet, inches };
}

export function convertWeightToDisplay(weightKg: number, unitSystem: UnitSystem): number {
  return unitSystem === 'imperial' ? kgToPounds(weightKg) : weightKg;
}

export function convertWeightToKg(value: number, unitSystem: UnitSystem): number {
  return unitSystem === 'imperial' ? poundsToKg(value) : value;
}

export function formatWeightNumber(
  weightKg: number,
  unitSystem: UnitSystem,
  decimals = 1
): string {
  const converted = convertWeightToDisplay(weightKg, unitSystem);
  return trimTrailingZeros(converted.toFixed(decimals));
}

export function formatWeight(
  weightKg: number,
  unitSystem: UnitSystem,
  decimals = 1
): string {
  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg';
  return `${formatWeightNumber(weightKg, unitSystem, decimals)} ${unitLabel}`;
}

export function formatSignedWeightDelta(
  weightKg: number,
  unitSystem: UnitSystem,
  decimals = 1
): string {
  const numeric = Number(formatWeightNumber(Math.abs(weightKg), unitSystem, decimals));
  const prefix = weightKg > 0 ? '+' : weightKg < 0 ? '-' : '';
  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg';
  return `${prefix}${trimTrailingZeros(numeric.toFixed(decimals))} ${unitLabel}`;
}

export function formatHeight(heightCm: number, unitSystem: UnitSystem): string {
  if (unitSystem === 'metric') {
    return `${Math.round(heightCm)} cm`;
  }

  const { feet, inches } = cmToFeetInches(heightCm);
  return `${feet} ft ${inches} in`;
}
