const API_BASE = '/api';

// 获取存储的 Token
function getToken() {
  return localStorage.getItem('nexto_token');
}

// 保存 Token
function setToken(token) {
  if (token) {
    localStorage.setItem('nexto_token', token);
  } else {
    localStorage.removeItem('nexto_token');
  }
}

// 统一请求包装函数
async function request(endpoint, options = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { ...defaultHeaders, ...options.headers },
  });

  const result = await response.json();

  if (response.status === 401) {
    // 登录过期或无效
    setToken(null);
    throw new Error('鉴权失效，请重新登录。');
  }

  // 假设后端返回的成功响应中 code 为 0
  if (result.code !== 0) {
    throw new Error(result.message || '请求失败');
  }

  return result.data;
}

const AuthAPI = {
  login: async (username, password) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (data && data.access_token) {
      setToken(data.access_token);
    }
    return data;
  },

  register: async (username, password, email = "") => {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email })
    });
  },

  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
    }
  },

  isLoggedIn: () => {
    return !!getToken();
  }
};

const ScheduleAPI = {
  list: (startTime, endTime) => {
    // 确保时间参数进行了 URI 编码
    const query = new URLSearchParams({ start_time: startTime, end_time: endTime }).toString();
    return request(`/schedules?${query}`);
  },

  create: (data) => {
    return request('/schedules/', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  update: (data) => {
    return request('/schedules/', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  delete: (id) => {
    return request(`/schedules/${id}`, {
      method: 'DELETE'
    });
  }
};

window.AuthAPI = AuthAPI;
window.ScheduleAPI = ScheduleAPI;
