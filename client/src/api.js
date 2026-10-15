import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
});

export const fetchOrders = async () => {
    const response = await api.get('/orders');
    return response.data;
};

export const fetchEvents = async (limit = 50) => {
    const response = await api.get('/events', { params: { limit } });
    return response.data;
};

export const getPushPublicKey = async () => {
    const response = await api.get('/push/public-key');
    return response.data.publicKey;
};

export const subscribePush = (subscription, minPriority) =>
    api.post('/push/subscribe', { subscription, minPriority, label: navigator.userAgent.slice(0, 120) });

export const unsubscribePush = (endpoint) => api.post('/push/unsubscribe', { endpoint });

export const testPush = (endpoint) => api.post('/push/test', { endpoint });

// PIN access: the server keeps an httpOnly session cookie
export const getSession = async () => (await api.get('/session')).data;

export const login = (pin) => api.post('/login', { pin });

export const logout = () => api.post('/logout');

// Any 401 means the session expired or the PIN changed: show the PIN screen again
export const onUnauthorized = (handler) => {
    const id = api.interceptors.response.use(undefined, (error) => {
        if (error.response?.status === 401 && !error.config?.url?.endsWith('/login')) handler();
        return Promise.reject(error);
    });
    return () => api.interceptors.response.eject(id);
};
