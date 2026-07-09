type StatusChipProps = {
  label: string;
  value: string;
  state: string;
};

export function StatusChip({ label, value, state }: StatusChipProps) {
  return (
    <span className={`chip state-${state}`}>
      <span className="chip__label">{label}</span>
      <span className="chip__value">{value}</span>
    </span>
  );
}
