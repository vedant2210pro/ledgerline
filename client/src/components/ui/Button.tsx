import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function ButtonLink({ className = '', ...props }: LinkProps) {
  return <Link className={`button ${className}`} {...props} />;
}
