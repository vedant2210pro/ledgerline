import { useId, type InputHTMLAttributes } from 'react';
export default function Input({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
    </div>
  );
}
