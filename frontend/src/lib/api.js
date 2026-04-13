import axios from 'axios';

const backendHost = window.location.hostname || '127.0.0.1';

const api = axios.create({
  baseURL: `http://${backendHost}:8000/api`,
});

export default api;
