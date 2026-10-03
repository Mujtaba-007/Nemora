'use client';

import React, { useState, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Check, X, ShieldAlert, KeyRound, Sparkles, Mail, User as UserIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuthStore, type AuthModalTab } from '@/lib/auth-store';
import {
  validateUsernameFormat,
  checkUsernameAvailability,
  evaluatePasswordStrength,
} from '@/lib/auth-validation';

export function AuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalTab,
    setAuthModalTab,
    authNotice,
    signIn,
    signUp,
    requestReset,
    updatePassword,
  } = useAuthStore();

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Status & Validation
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Username validation state
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const errorId = useId();

  // Reset errors when tab changes
  useEffect(() => {
    setFormError(null);
    setFormSuccess(null);
  }, [authModalTab]);

  // Debounced username availability check
  useEffect(() => {
    if (authModalTab !== 'signup' || !username.trim()) {
      setUsernameAvailable(null);
      setUsernameError(null);
      return;
    }

    const formatCheck = validateUsernameFormat(username);
    if (!formatCheck.valid) {
      setUsernameAvailable(false);
      setUsernameError(formatCheck.error || 'Invalid username');
      return;
    }

    setUsernameError(null);
    setUsernameChecking(true);

    const timer = setTimeout(async () => {
      const isFree = await checkUsernameAvailability(username);
      setUsernameChecking(false);
      setUsernameAvailable(isFree);
      if (!isFree) {
        setUsernameError('Username already taken');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username, authModalTab]);

  const passwordStrength = evaluatePasswordStrength(password);
  const newPasswordStrength = evaluatePasswordStrength(newPassword);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!identifier.trim() || !password) {
      setFormError('Credentials not recognized');
      return;
    }

    setIsPending(true);
    const res = await signIn({ identifier, password });
    setIsPending(false);

    if (!res.success) {
      setFormError(res.error || 'Credentials not recognized');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const usernameCheck = validateUsernameFormat(username);
    if (!usernameCheck.valid) {
      setFormError(usernameCheck.error || 'Invalid username');
      return;
    }

    if (usernameAvailable === false) {
      setFormError('Username already taken. Please choose another.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setFormError('Please enter a valid email address');
      return;
    }

    if (!passwordStrength.isAcceptable) {
      setFormError(passwordStrength.error || 'Password does not meet security criteria');
      return;
    }

    setIsPending(true);
    const res = await signUp({ username, email, password });
    setIsPending(false);

    if (res.success) {
      if (res.requiresEmailConfirmation) {
        setAuthModalTab('check-email');
      } else {
        closeAuthModal();
      }
    } else {
      setFormError(res.error || 'Signup could not be completed.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !email.includes('@')) {
      setFormError('Please enter a valid email address');
      return;
    }

    setIsPending(true);
    const res = await requestReset(email);
    setIsPending(false);

    if (res.success) {
      setFormSuccess('Recovery transmission dispatched. Check your inbox.');
    } else {
      setFormError(res.error || 'Unable to process reset request.');
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newPasswordStrength.isAcceptable) {
      setFormError(newPasswordStrength.error || 'Password does not meet security criteria');
      return;
    }

    setIsPending(true);
    const res = await updatePassword(newPassword);
    setIsPending(false);

    if (res.success) {
      setFormSuccess('Access credentials updated. Access granted.');
      setTimeout(() => {
        closeAuthModal();
      }, 1200);
    } else {
      setFormError(res.error || 'Failed to update password.');
    }
  };

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={(open) => !open && closeAuthModal()}>
      <DialogContent className="sm:max-w-[440px] bg-cosmic border border-neon-green/30 text-foreground p-0 overflow-hidden shadow-[0_0_50px_rgba(0,255,136,0.15)]">
        {/* Top Glowing Header Banner */}
        <div className="bg-gradient-to-r from-neon-green/20 via-neon-green/5 to-transparent p-6 border-b border-glass-border">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
              <DialogTitle className="text-xl font-sans font-bold text-foreground">
                Nemora <span className="text-neon-green neon-text">Terminal</span>
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs font-mono text-muted-foreground">
              {authModalTab === 'login' && 'Authenticate to sync carbon metrics & bank eco-coins.'}
              {authModalTab === 'signup' && 'Initialize account to begin your carbon reduction journey.'}
              {authModalTab === 'forgot' && 'Reset access credentials via secure transmission.'}
              {authModalTab === 'check-email' && 'Authorization required. Verification link transmitted.'}
              {authModalTab === 'reset-password' && 'Enter your new secure access credentials.'}
            </DialogDescription>
          </DialogHeader>

          {/* Context Notice (e.g. from Monster Hunt / Arena) */}
          {authNotice && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 p-2 rounded-lg bg-yellow-400/10 border border-yellow-400/30 flex items-center gap-2 text-xs font-mono text-yellow-300"
            >
              <Sparkles className="w-4 h-4 shrink-0 text-yellow-400" />
              <span>{authNotice}</span>
            </motion.div>
          )}

          {/* Tab Switcher */}
          {(authModalTab === 'login' || authModalTab === 'signup') && (
            <div className="flex items-center gap-1 mt-4 p-1 bg-black/40 border border-glass-border rounded-lg">
              <button
                type="button"
                onClick={() => setAuthModalTab('login')}
                className={`flex-1 py-1.5 px-3 rounded-md font-mono text-xs transition-all duration-200 ${
                  authModalTab === 'login'
                    ? 'bg-neon-green/20 text-neon-green border border-neon-green/40 shadow-[0_0_10px_rgba(0,255,136,0.3)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => setAuthModalTab('signup')}
                className={`flex-1 py-1.5 px-3 rounded-md font-mono text-xs transition-all duration-200 ${
                  authModalTab === 'signup'
                    ? 'bg-neon-green/20 text-neon-green border border-neon-green/40 shadow-[0_0_10px_rgba(0,255,136,0.3)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sign Up
              </button>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {/* Top-Level aria-live Error Notification */}
          <div aria-live="polite" className="mb-4">
            {formError && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                id={errorId}
                className="p-3 rounded-lg bg-neon-red/10 border border-neon-red/40 text-neon-red text-xs font-mono flex items-start gap-2 shadow-[0_0_15px_rgba(255,68,102,0.15)]"
              >
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </motion.div>
            )}

            {formSuccess && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 rounded-lg bg-neon-green/10 border border-neon-green/40 text-neon-green text-xs font-mono flex items-start gap-2 shadow-[0_0_15px_rgba(0,255,136,0.15)]"
              >
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formSuccess}</span>
              </motion.div>
            )}
          </div>

          <AnimatePresence mode="wait">
            {/* 1. LOGIN TAB */}
            {authModalTab === 'login' && (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleLogin}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-mono text-muted-foreground mb-1"
                  >
                    Username or Email
                  </label>
                  <div className="relative">
                    <input
                      id="login-identifier"
                      type="text"
                      autoComplete="username"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="e.g. green_coder or user@nemora.tech"
                      className="w-full px-3 py-2 bg-black/40 border border-glass-border rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green transition-all"
                    />
                    <UserIcon className="w-4 h-4 text-muted-foreground absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="login-password"
                      className="text-xs font-mono text-muted-foreground"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setAuthModalTab('forgot')}
                      className="text-[11px] font-mono text-neon-green/80 hover:text-neon-green transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-black/40 border border-glass-border rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-2.5 px-4 bg-neon-green/20 border border-neon-green text-neon-green font-mono font-bold text-sm rounded-lg hover:bg-neon-green/30 disabled:opacity-50 transition-all duration-200 shadow-[0_0_20px_rgba(0,255,136,0.2)] mt-2"
                >
                  {isPending ? 'Authenticating...' : 'Access Terminal'}
                </button>
              </motion.form>
            )}

            {/* 2. SIGNUP TAB */}
            {authModalTab === 'signup' && (
              <motion.form
                key="signup"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSignUp}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="signup-username"
                    className="block text-xs font-mono text-muted-foreground mb-1"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <input
                      id="signup-username"
                      type="text"
                      autoComplete="username"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      placeholder="3-20 chars (a-z, 0-9, _)"
                      className={`w-full px-3 py-2 bg-black/40 border rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none transition-all pr-10 ${
                        usernameError
                          ? 'border-neon-red focus:ring-1 focus:ring-neon-red'
                          : usernameAvailable === true
                          ? 'border-neon-green focus:ring-1 focus:ring-neon-green'
                          : 'border-glass-border focus:border-neon-green focus:ring-1 focus:ring-neon-green'
                      }`}
                    />
                    <div className="absolute right-3 top-3">
                      {usernameChecking && (
                        <div className="w-3.5 h-3.5 border-2 border-neon-green/30 border-t-neon-green rounded-full animate-spin" />
                      )}
                      {!usernameChecking && usernameAvailable === true && (
                        <Check className="w-4 h-4 text-neon-green" />
                      )}
                      {!usernameChecking && usernameError && (
                        <X className="w-4 h-4 text-neon-red" />
                      )}
                    </div>
                  </div>
                  {usernameError && (
                    <p className="text-[11px] font-mono text-neon-red mt-1">{usernameError}</p>
                  )}
                  {!usernameError && usernameAvailable === true && (
                    <p className="text-[11px] font-mono text-neon-green mt-1">Username available</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-xs font-mono text-muted-foreground mb-1"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="developer@nemora.tech"
                      className="w-full px-3 py-2 bg-black/40 border border-glass-border rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green transition-all"
                    />
                    <Mail className="w-4 h-4 text-muted-foreground absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-xs font-mono text-muted-foreground mb-1"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full px-3 py-2 bg-black/40 border border-glass-border rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-muted-foreground">Strength:</span>
                        <span style={{ color: passwordStrength.color }} className="font-bold">
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden flex gap-1">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className="h-full flex-1 rounded-full transition-all duration-300"
                            style={{
                              backgroundColor:
                                step <= passwordStrength.score ? passwordStrength.color : 'rgba(255,255,255,0.08)',
                            }}
                          />
                        ))}
                      </div>
                      {passwordStrength.error && (
                        <p className="text-[11px] font-mono text-neon-red mt-1">
                          {passwordStrength.error}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isPending || !passwordStrength.isAcceptable || usernameAvailable === false}
                  className="w-full py-2.5 px-4 bg-neon-green/20 border border-neon-green text-neon-green font-mono font-bold text-sm rounded-lg hover:bg-neon-green/30 disabled:opacity-50 transition-all duration-200 shadow-[0_0_20px_rgba(0,255,136,0.2)] mt-2"
                >
                  {isPending ? 'Initializing Account...' : 'Initialize Account'}
                </button>
              </motion.form>
            )}

            {/* 3. FORGOT PASSWORD TAB */}
            {authModalTab === 'forgot' && (
              <motion.form
                key="forgot"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleForgotPassword}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-xs font-mono text-muted-foreground mb-1"
                  >
                    Registered Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="developer@nemora.tech"
                    className="w-full px-3 py-2 bg-black/40 border border-glass-border rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green transition-all"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthModalTab('login')}
                    className="py-2.5 px-4 bg-glass-bg border border-glass-border text-foreground font-mono text-xs rounded-lg hover:border-muted-foreground transition-colors"
                  >
                    Back to Login
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-2.5 px-4 bg-neon-green/20 border border-neon-green text-neon-green font-mono font-bold text-xs rounded-lg hover:bg-neon-green/30 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]"
                  >
                    {isPending ? 'Transmitting...' : 'Dispatch Reset Link'}
                  </button>
                </div>
              </motion.form>
            )}

            {/* 4. CHECK EMAIL CONFIRMATION TAB */}
            {authModalTab === 'check-email' && (
              <motion.div
                key="check-email"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4 space-y-4"
              >
                <div className="w-12 h-12 rounded-full bg-neon-green/20 border border-neon-green flex items-center justify-center mx-auto text-neon-green shadow-[0_0_20px_rgba(0,255,136,0.3)]">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-foreground text-lg">Check Your Inbox</h3>
                  <p className="text-xs font-mono text-muted-foreground mt-2 max-w-xs mx-auto">
                    We dispatched a verification link to <span className="text-neon-green">{email}</span>. Click the link to complete terminal initialization.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAuthModalTab('login')}
                  className="py-2 px-6 bg-glass-bg border border-glass-border text-neon-green font-mono text-xs rounded-lg hover:bg-neon-green/10 transition-colors"
                >
                  Return to Login
                </button>
              </motion.div>
            )}

            {/* 5. RESET PASSWORD TAB */}
            {authModalTab === 'reset-password' && (
              <motion.form
                key="reset-password"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleSetNewPassword}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-xs font-mono text-muted-foreground mb-1"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full px-3 py-2 bg-black/40 border border-glass-border rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {newPassword.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-muted-foreground">Strength:</span>
                        <span style={{ color: newPasswordStrength.color }} className="font-bold">
                          {newPasswordStrength.label}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden flex gap-1">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className="h-full flex-1 rounded-full transition-all duration-300"
                            style={{
                              backgroundColor:
                                step <= newPasswordStrength.score
                                  ? newPasswordStrength.color
                                  : 'rgba(255,255,255,0.08)',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isPending || !newPasswordStrength.isAcceptable}
                  className="w-full py-2.5 px-4 bg-neon-green/20 border border-neon-green text-neon-green font-mono font-bold text-sm rounded-lg hover:bg-neon-green/30 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(0,255,136,0.2)]"
                >
                  {isPending ? 'Updating...' : 'Set New Password'}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
