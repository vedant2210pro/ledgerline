import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@ledgerline/shared';
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react';
import Brand from '../components/Brand';
import { useAuth } from '../auth/context';
export default function LoginPage() {
  const auth = useAuth(),
    navigate = useNavigate(),
    location = useLocation(),
    [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string; password: string }>({ resolver: zodResolver(loginSchema) });
  const from =
    typeof location.state?.from === 'string' && location.state.from.startsWith('/app')
      ? location.state.from
      : '/app';
  if (auth.user) return <Navigate to={from} replace />;
  return (
    <main className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <p className="eyebrow">YOUR FINANCIAL WORKSPACE</p>
          <h1>
            A clearer view.
            <br />A considered
            <br />
            <em>way forward.</em>
          </h1>
          <p>
            Banking, people, and payroll.
            <br />
            Thoughtfully brought together.
          </p>
        </div>
        <span>LEDGERLINE / ACADEMIC DEMONSTRATION</span>
      </div>
      <div className="login-panel">
        <Link className="text-link" to="/">
          <ArrowLeft size={16} /> Back to website
        </Link>
        <div className="login-form">
          <span className="module-icon">
            <LockKeyhole size={27} />
          </span>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your workspace.</h2>
          <p>
            Manage customer relationships, accounts and branches with your assigned permissions.
          </p>
          <form
            onSubmit={handleSubmit(async (values) => {
              setError('');
              try {
                await auth.login(values.email, values.password);
                navigate(from, { replace: true });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Unable to sign in.');
              }
            })}
            noValidate
          >
            <div className="field">
              <label htmlFor="login-email">Work email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                {...register('email')}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {errors.email && (
                <span id="email-error" className="field-error">
                  {errors.email.message}
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                aria-invalid={!!errors.password}
              />
              {errors.password && <span className="field-error">{errors.password.message}</span>}
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="button" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-notice">
            Access is provided by your workspace administrator. There is no public registration.
          </div>
          <Link className="text-link" to="/preview">
            Explore the fictional preview
          </Link>
        </div>
        <p className="login-footnote">
          Educational demonstration. No real banking or payroll payments.
        </p>
      </div>
    </main>
  );
}
