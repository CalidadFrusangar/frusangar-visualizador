import React, { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { login } from '../api';
import logo from '../assets/logo.png';

const Login = ({ onSuccess, notConfigured = false }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState(null);
    const [sending, setSending] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!pin || sending) return;
        setSending(true);
        setError(null);
        try {
            await login(pin);
            onSuccess();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo conectar con el servidor');
            setPin('');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-frusangar-light flex items-center justify-center p-4">
            <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl shadow-card border border-stone-100/80 p-8">
                <img src={logo} alt="Frusangar" className="h-12 w-auto object-contain mx-auto mb-4" />
                <h1 className="text-xl font-display font-bold text-frusangar-text text-center">Visualizador de Pedidos</h1>
                <p className="text-sm text-stone-500 text-center mt-1 mb-6 flex items-center justify-center gap-1.5">
                    <Lock size={14} /> Introduce el PIN de acceso
                </p>

                {notConfigured ? (
                    <p className="p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-sm">
                        El acceso no está configurado en el servidor (falta APP_PIN).
                    </p>
                ) : (
                    <>
                        <input
                            type="password"
                            inputMode="numeric"
                            autoComplete="current-password"
                            autoFocus
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            className="w-full text-center text-2xl tracking-[0.4em] font-bold border border-stone-200 rounded-lg py-3 focus:outline-none focus:ring-2 focus:ring-frusangar-green/40 focus:border-frusangar-green"
                            aria-label="PIN"
                        />
                        {error && <p className="mt-3 text-sm font-semibold text-red-600 text-center">{error}</p>}
                        <button
                            type="submit"
                            disabled={!pin || sending}
                            className="mt-5 w-full py-3 rounded-xl bg-frusangar-green hover:bg-frusangar-dark text-white font-bold shadow-lg shadow-frusangar-green/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                        >
                            {sending && <Loader2 size={18} className="animate-spin" />}
                            Entrar
                        </button>
                        <p className="mt-4 text-[11px] text-stone-400 text-center">Este dispositivo recordará el acceso durante 6 meses.</p>
                    </>
                )}
            </form>
        </div>
    );
};

export default Login;
