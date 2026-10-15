import React, { useEffect, useState } from 'react';
import { X, Loader2, UserCheck } from 'lucide-react';
import { fetchEmployees } from '../api';

const readLast = () => {
    try { return Number(localStorage.getItem('lastEmployeeId')) || null; } catch { return null; }
};
const saveLast = (id) => {
    try { localStorage.setItem('lastEmployeeId', String(id)); } catch { /* ignore */ }
};

// "Who saw it?": big name buttons for the plant screen, last person on this device first
const EmployeePicker = ({ event, onPick, onCancel }) => {
    const [employees, setEmployees] = useState(null);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(null);
    const lastId = readLast();

    useEffect(() => {
        if (!event) return;
        let alive = true;
        fetchEmployees()
            .then(list => alive && setEmployees(list))
            .catch(err => alive && setError(err.response?.data?.error || 'No se pudo cargar la lista de empleados'));
        return () => { alive = false; };
    }, [event]);

    if (!event) return null;

    const pick = async (employee) => {
        setSaving(employee.id);
        setError(null);
        try {
            saveLast(employee.id);
            await onPick(employee);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo guardar. Inténtalo de nuevo.');
        } finally {
            setSaving(null);
        }
    };

    const last = employees?.find(e => e.id === lastId);
    const others = (employees || []).filter(e => e.id !== lastId);

    return (
        <div className="fixed inset-0 z-[70] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-float w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-3">
                    <UserCheck className="text-frusangar-green shrink-0" size={22} />
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-frusangar-dark">¿Quién lo ha visto?</h2>
                        <p className="text-xs text-stone-500 truncate">
                            {event.test && 'PRUEBA · '}{event.orderName} · {event.partner}
                        </p>
                    </div>
                    <button onClick={onCancel} className="ml-auto p-1.5 rounded-lg text-stone-400 hover:bg-stone-100" title="Volver"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {error && <p className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">{error}</p>}
                    {!employees && !error && (
                        <div className="py-10 flex justify-center text-stone-400"><Loader2 className="animate-spin" /></div>
                    )}
                    {last && (
                        <button
                            onClick={() => pick(last)}
                            disabled={saving !== null}
                            className="w-full mb-4 px-4 py-4 rounded-xl bg-frusangar-green hover:bg-frusangar-dark text-white text-lg font-black flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
                        >
                            {saving === last.id ? <Loader2 size={20} className="animate-spin" /> : '✔'} Soy {last.name}
                        </button>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {others.map(e => (
                            <button
                                key={e.id}
                                onClick={() => pick(e)}
                                disabled={saving !== null}
                                className="px-3 py-3 rounded-xl border border-stone-200 bg-white hover:border-frusangar-green hover:bg-frusangar-light text-left active:scale-[0.98] disabled:opacity-60"
                            >
                                <div className="text-sm font-bold text-stone-800 leading-tight flex items-center gap-1.5">
                                    {saving === e.id && <Loader2 size={14} className="animate-spin shrink-0" />}
                                    {e.name}
                                </div>
                                {e.department && <div className="text-[11px] text-stone-400 mt-0.5">{e.department}</div>}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmployeePicker;
