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
