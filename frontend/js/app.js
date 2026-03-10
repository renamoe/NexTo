/**
 * 地图日程提醒 - App.js
 * 使用高德地图 JS API 2.0 + Bootstrap 5
 */

// =====================================================
//  配置区：替换为你的高德地图 Key 和安全密钥
// =====================================================
const AMAP_KEY = '4df63897bc05585ad18e1a89000e8433';           // 替换为你申请的 Web端 Key
const AMAP_SECURITY = 'bb5bde7424a33ade69a61a4e08b71362';         // 替换为你的安全密钥

// =====================================================
//  全局状态
// =====================================================
let AMapRef = null;           // 高德地图 AMap 对象引用（全局保存）
let mapInstance = null;       // 高德地图实例
let geocoder = null;          // 逆地理编码插件
let placeSearch = null;       // 地点搜索插件
let allMarkers = {};          // { id: AMap.Marker }
let infoWindow = null;        // 当前打开的信息窗体
let pendingLng = null;        // 待添加日程的经度
let pendingLat = null;        // 待添加日程的纬度
let currentDetailId = null;   // 当前详情弹窗对应的日程 ID
let remindedSet = new Set();  // 已经提醒过的日程 ID（本次会话）
// — 路线查询 —
let drivingPlugin = null;     // AMap.Driving 驾车路线
let walkingPlugin = null;     // AMap.Walking 步行路线
let ridingPlugin = null;      // AMap.Riding  骑行路线
let userLocation = null;      // 用户当前位置 { lng, lat, address }
let smartRemindedSet = new Set(); // 智能出行已提醒过的日程 ID
let currentNavId = null;      // 导航弹窗对应的日程 ID
// — 地图路线绘制 —
let userLocMarker = null;        // 用户位置蓝色 Marker
let drawDriving = null;          // 带地图渲染的驾车插件
let drawWalking = null;          // 带地图渲染的步行插件
let drawRiding  = null;          // 带地图渲染的骑行插件
let activeRouteScheduleId = null; // 当前地图上路线对应的日程 ID
let activeRouteMode = 'driving';  // 当前出行方式

const STORAGE_KEY = 'map_schedules_v2';

// =====================================================
//  工具函数
// =====================================================

/** 生成唯一 ID */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 从本地缓存读取日程列表（同步，供页面各处渲染使用） */
let _currentSchedules = [];
function loadSchedules() {
  return _currentSchedules;
}

/** 仅用于本地更新状态，不再写入 localStorage */
function saveSchedules(list) {
  _currentSchedules = list;
}

/** 从后端同步日程 */
async function fetchSchedules() {
  if (!window.AuthAPI || !window.AuthAPI.isLoggedIn()) {
    _currentSchedules = [];
    return;
  }
  try {
    const end = new Date();
    end.setFullYear(end.getFullYear() + 2); // 取未来两年
    const start = new Date();
    start.setMonth(start.getMonth() - 6);   // 取过去半年

    const res = await window.ScheduleAPI.list(start.toISOString(), end.toISOString());
    // 清空现有的 Markers
    _currentSchedules.forEach(s => {
      if (typeof removeMarkerFromMap === 'function') removeMarkerFromMap(s.id);
    });

    // 映射后端字段到前端需要的字段
    _currentSchedules = res.schedules.map(b => {
      // 尝试解析存入 description 中的附加 JSON 配置
      let meta = {};
      let desc = b.description || '';
      try {
        if (desc.startsWith('###META###')) {
          const parts = desc.split('\\n');
          meta = JSON.parse(parts[0].replace('###META###', ''));
          desc = parts.slice(1).join('\\n');
        }
      } catch (e) {}

      return {
        id: b.id !== undefined ? b.id : b.schedule_id,
        title: b.title,
        time: b.start_time ? b.start_time.split('.')[0].slice(0, 16) : '',
        lng: b.lng,
        lat: b.lat,
        location: b.location_name,
        amap_poi_id: b.amap_poi_id || '',
        note: desc,
        color: meta.color || '#4285F4',
        remindBefore: meta.remindBefore || 15,
        remindBrowser: meta.remindBrowser !== undefined ? meta.remindBrowser : true,
        remindSound: meta.remindSound || false,
        smartRemind: meta.smartRemind || false,
        travelMode: meta.travelMode || 'driving',
        createdAt: b.start_time
      };
    });

    // 重新添加 Markers 到地图并刷新列表
    _currentSchedules.forEach(s => {
      if (typeof addMarkerToMap === 'function') addMarkerToMap(s);
    });
    if (typeof renderList === 'function') renderList();
    if (typeof updateTodayBadge === 'function') updateTodayBadge();

  } catch (err) {
    console.warn('获取日程失败 =', err.message);
  }
}

/** 格式化时间显示 */
function fmtDatetime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 判断日程状态 */
function scheduleStatus(schedule) {
  const now = new Date();
  const t = new Date(schedule.time);
  const diff = t - now;
  if (diff < 0) return 'past';         // 已过期
  if (diff <= 60 * 60 * 1000) return 'soon'; // 1小时内
  const same = d => d.toDateString() === now.toDateString();
  if (same(t)) return 'today';
  return 'upcoming';
}

/** 状态徽标 HTML */
function statusBadgeHtml(status) {
  const map = {
    past:     ['bg-secondary', '已过期'],
    soon:     ['bg-danger',    '即将开始'],
    today:    ['bg-warning text-dark', '今日'],
    upcoming: ['bg-success',  '即将到来'],
  };
  const [cls, label] = map[status] || ['bg-secondary', '未知'];
  return `<span class="status-badge ${cls} text-white">${label}</span>`;
}

// =====================================================
//  地图初始化
// =====================================================
function initMap() {
  window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY };

  AMapLoader.load({
    key: AMAP_KEY,
    version: '2.0',
    plugins: [
      'AMap.Geocoder',
      'AMap.PlaceSearch',
      'AMap.AutoComplete',
      'AMap.Geolocation',
      'AMap.Scale',
      'AMap.ToolBar',
      'AMap.Driving',
      'AMap.Walking',
      'AMap.Riding',
    ],
  })
    .then(AMap => {
      AMapRef = AMap;   // 保存全局引用
      mapInstance = new AMap.Map('mapContainer', {
        zoom: 12,
        center: [116.397428, 39.90923],
        mapStyle: 'amap://styles/light',
        viewMode: '2D',
        features: ['bg', 'road', 'building', 'point'],
      });

      // 缩放、比例尺控件
      mapInstance.addControl(new AMap.Scale());
      mapInstance.addControl(new AMap.ToolBar({ position: 'RB' }));

      // 逆地理编码
      geocoder = new AMap.Geocoder({ radius: 100 });

      // 地点搜索
      placeSearch = new AMap.PlaceSearch({ map: mapInstance, pageSize: 5 });

      // 顶部搜索栏自动补全
      const autoComplete = new AMap.AutoComplete({ input: 'searchInput' });
      autoComplete.on('select', e => {
        placeSearch.setCity(e.poi.adcode);
        placeSearch.search(e.poi.name);
      });

      // 弹窗内地点搜索 — 手动调用 search，自定义渲染下拉（避免 AMap 自带下拉被 Modal 遮挡）
      const locationAC = new AMap.AutoComplete({ city: '全国' });

      const suggestList  = document.getElementById('locationSuggestList');
      const locationInput = document.getElementById('locationSearchInput');

      // 封装搜索逻辑
      function doLocationSearch() {
        const kw = locationInput.value.trim();
        if (!kw) { suggestList.innerHTML = ''; suggestList.classList.add('d-none'); return; }
        locationAC.search(kw, (status, result) => {
          suggestList.innerHTML = '';
          if (status !== 'complete' || !result.tips || result.tips.length === 0) {
            suggestList.classList.add('d-none');
            return;
          }
          result.tips.forEach(tip => {
            if (!tip.name) return;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'list-group-item list-group-item-action py-1 px-2';
            item.style.fontSize = '0.85rem';
            const district = tip.district || tip.address || '';
            item.innerHTML = `<span class="fw-semibold">${escHtml(tip.name)}</span>`
              + (district ? ` <small class="text-muted">${escHtml(district)}</small>` : '');
            item.addEventListener('mousedown', e => {
              // 用 mousedown 而非 click，防止 blur 先于 click 触发导致列表消失
              e.preventDefault();
              suggestList.classList.add('d-none');
              const loc = tip.location;
              if (loc) {
                const lng = typeof loc.getLng === 'function' ? loc.getLng() : (loc.lng || loc.R);
                const lat = typeof loc.getLat === 'function' ? loc.getLat() : (loc.lat || loc.Q);
                if (!isNaN(lng) && !isNaN(lat)) {
                  applyPoiToForm(tip.name, district, lng, lat);
                  return;
                }
              }
              // 坐标为空，用地址编码
              if (geocoder) {
                const q = tip.name + (tip.city || tip.district || '');
                geocoder.getLocation(q, (st, res) => {
                  if (st === 'complete' && res.geocodes && res.geocodes.length > 0) {
                    const g = res.geocodes[0];
                    applyPoiToForm(tip.name, district, g.location.getLng(), g.location.getLat());
                  } else {
                    showToast('未能解析坐标，请尝试其他搜索词', 'warning');
                  }
                });
              }
            });
            suggestList.appendChild(item);
          });
          suggestList.classList.remove('d-none');
        });
      }

      // 输入时延迟 350ms 搜索
      let locationSearchTimer = null;
      locationInput.addEventListener('input', () => {
        clearTimeout(locationSearchTimer);
        locationSearchTimer = setTimeout(doLocationSearch, 350);
      });
      // 回车直接搜索
      locationInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { clearTimeout(locationSearchTimer); doLocationSearch(); }
        if (e.key === 'Escape') { suggestList.classList.add('d-none'); }
      });
      // 失焦时关闭下拉（mousedown 已用 preventDefault 保护点击）
      locationInput.addEventListener('blur', () => {
        setTimeout(() => suggestList.classList.add('d-none'), 150);
      });
      // 搜索按鈕
      document.getElementById('locationSearchBtn').addEventListener('click', () => {
        clearTimeout(locationSearchTimer);
        doLocationSearch();
      });

      // 高德路线插件初始化（数据查询用，不渲染）
      drivingPlugin = new AMap.Driving({ policy: 0 });
      walkingPlugin = new AMap.Walking();
      ridingPlugin  = new AMap.Riding();

      // 路线绘制插件（带 map 参数，在地图上渲染路线）
      drawDriving = new AMap.Driving({ policy: 0, map: mapInstance, panel: false });
      drawWalking = new AMap.Walking({ map: mapInstance, panel: false });
      drawRiding  = new AMap.Riding({ map: mapInstance, panel: false });

      // 地图点击: 弹出新增日程对话框
      mapInstance.on('click', onMapClick);

      // 加载已有日程的 Marker
      loadSchedules().forEach(s => addMarkerToMap(s, AMap));

      // 启动提醒定时器
      startReminderTimer();

      // 渲染侧边栏列表
      renderList();
      updateTodayBadge();

      // 初始化用户位置标记
      initUserLocation();
    })
    .catch(err => {
      console.error('高德地图加载失败:', err);
      document.getElementById('mapContainer').innerHTML =
        `<div class="d-flex align-items-center justify-content-center h-100 text-danger fs-5">
           <i class="bi bi-exclamation-triangle me-2"></i>
           地图加载失败，请检查 API Key 配置
         </div>`;
    });
}

// =====================================================
//  地图点击事件
// =====================================================
function onMapClick(e) {
  pendingLng = e.lnglat.getLng();
  pendingLat = e.lnglat.getLat();

  // 填入坐标
  document.getElementById('scheduleLng').value = pendingLng.toFixed(6);
  document.getElementById('scheduleLat').value = pendingLat.toFixed(6);
  document.getElementById('editId').value = '';
  document.getElementById('editLng').value = pendingLng;
  document.getElementById('editLat').value = pendingLat;

  // 逆地理编码获取地点名称
  if (geocoder) {
    geocoder.getAddress([pendingLng, pendingLat], (status, result) => {
      if (status === 'complete' && result.regeocode) {
        const addr = result.regeocode.formattedAddress || '';
        document.getElementById('scheduleLocation').value = addr;
        document.getElementById('locationSearchInput').value = '';
      }
    });
  }

  // 重置表单（保留坐标）
  resetModalForm(true);

  // 打开弹窗
  const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
  document.getElementById('scheduleModalLabel').innerHTML =
    '<i class="bi bi-calendar-plus me-2"></i>新增日程';
  modal.show();
}

// =====================================================
//  Marker 操作
// =====================================================
function addMarkerToMap(schedule, AMap_) {
  const AMap = AMap_ || AMapRef;
  if (!AMap || !mapInstance) return;

  // 自定义 marker 内容
  const html = `
    <div class="custom-marker-wrap">
      <div class="marker-icon" style="background:${schedule.color || '#4285F4'}">
        <i class="bi bi-calendar-event"></i>
      </div>
      <div class="marker-tip"></div>
    </div>`;

  const marker = new AMap.Marker({
    position: [schedule.lng, schedule.lat],
    content: html,
    offset: new AMap.Pixel(-18, -46),
    title: schedule.title,
    zIndex: 110,
  });

  marker.on('click', () => openDetailModal(schedule.id));

  mapInstance.add(marker);
  allMarkers[schedule.id] = marker;
}

function removeMarkerFromMap(id) {
  if (allMarkers[id]) {
    mapInstance.remove(allMarkers[id]);
    delete allMarkers[id];
  }
}

function refreshMarkerColor(schedule) {
  removeMarkerFromMap(schedule.id);
  addMarkerToMap(schedule);
}

// =====================================================
//  信息窗口
// =====================================================
function openInfoWindow(schedule) {
  if (!mapInstance || !AMapRef) return;

  if (!infoWindow) {
    infoWindow = new AMapRef.InfoWindow({ offset: new AMapRef.Pixel(0, -46), isCustom: true });
  }

  const status = scheduleStatus(schedule);
  const content = `
    <div class="info-window" style="min-width:220px">
      <div class="iw-header" style="background:${schedule.color || '#4285F4'}">
        <i class="bi bi-calendar-event"></i>
        <span>${escHtml(schedule.title)}</span>
      </div>
      <div class="iw-body">
        <div class="row-item">
          <i class="bi bi-clock"></i>
          <span>${fmtDatetime(schedule.time)}</span>
        </div>
        ${schedule.location ? `<div class="row-item"><i class="bi bi-geo-alt"></i><span>${escHtml(schedule.location)}</span></div>` : ''}
        ${schedule.note ? `<div class="row-item"><i class="bi bi-card-text"></i><span>${escHtml(schedule.note)}</span></div>` : ''}
        <div class="mt-1">${statusBadgeHtml(status)}</div>
      </div>
      <div class="iw-footer">
        <button class="btn btn-sm btn-outline-secondary" onclick="closeInfoWindow()">关闭</button>
        <button class="btn btn-sm btn-outline-success" onclick="drawRouteToSchedule('${schedule.id}');closeInfoWindow()"><i class="bi bi-map me-1"></i>画路线</button>
        <button class="btn btn-sm btn-outline-info" onclick="openNavModal('${schedule.id}')"><i class="bi bi-signpost-2 me-1"></i>路况</button>
        <button class="btn btn-sm btn-primary" onclick="openDetailModal('${schedule.id}')">详情</button>
      </div>
    </div>`;

  infoWindow.setContent(content);
  infoWindow.open(mapInstance, [schedule.lng, schedule.lat]);
}

function closeInfoWindow() {
  if (infoWindow) infoWindow.close();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 将选中的 POI 填入日程表单 */
function applyPoiToForm(name, address, lng, lat) {
  document.getElementById('editLng').value = lng;
  document.getElementById('editLat').value = lat;
  document.getElementById('scheduleLng').value = Number(lng).toFixed(6);
  document.getElementById('scheduleLat').value = Number(lat).toFixed(6);
  document.getElementById('scheduleLocation').value = name + (address ? ' · ' + address : '');
  document.getElementById('locationSearchInput').value = name;
  if (mapInstance) {
    mapInstance.setCenter([lng, lat]);
    mapInstance.setZoom(15);
  }
  showToast(`已选择：${name}`, 'success');
}

/** 将时间格式化为 HH:mm */
function fmtTime(date) {
  if (!date || isNaN(date)) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// =====================================================
//  定位 - 初始化用户位置蓝色标记（每 60s 刷新）
// =====================================================
function initUserLocation() {
  if (!AMapRef || !mapInstance) return;
  const geo = new AMapRef.Geolocation({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000,
  });
  geo.getCurrentPosition((status, result) => {
    if (status !== 'complete') return;

    const lng = result.position.getLng();
    const lat = result.position.getLat();
    userLocation = {
      lng,
      lat,
      address: result.formattedAddress || '',
    };

    // 更新或创建用户位置 Marker（蓝色脉冲圆点）
    if (userLocMarker) {
      userLocMarker.setPosition([lng, lat]);
    } else {
      userLocMarker = new AMapRef.Marker({
        position: [lng, lat],
        content: '<div class="user-loc-marker"><div class="pulse-ring"></div><div class="pulse-dot"></div></div>',
        offset: new AMapRef.Pixel(-18, -18),
        zIndex: 200,
        title: '我的位置',
      });
      mapInstance.add(userLocMarker);
      // 飞到用户所在位置（仅初次）
      mapInstance.setCenter([lng, lat]);
    }
  });

  // 60 秒后重新定位刷新
  setTimeout(initUserLocation, 60 * 1000);
}

// =====================================================
//  定位 - 获取用户当前位置
// =====================================================
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (userLocation) return resolve(userLocation);
    if (!AMapRef) return reject(new Error('地图未加载'));
    const geo = new AMapRef.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });
    geo.getCurrentPosition((status, result) => {
      if (status === 'complete') {
        userLocation = {
          lng: result.position.getLng(),
          lat: result.position.getLat(),
          address: result.formattedAddress || '',
        };
        // 60 秒后清除缓存，下次重新定位
        setTimeout(() => { userLocation = null; }, 60 * 1000);
        resolve(userLocation);
      } else {
        reject(new Error('定位失败：' + (result.message || status)));
      }
    });
  });
}

// =====================================================
//  路线查询（驾车 / 歗行 / 骑行）
// =====================================================
function queryRoute(destLng, destLat, mode, originLng, originLat) {
  return new Promise((resolve, reject) => {
    if (!AMapRef) return reject(new Error('地图未加载'));
    if (!drivingPlugin || !walkingPlugin || !ridingPlugin) {
      return reject(new Error('路线插件未就绪，请等待地图完全加载后重试'));
    }
    const origin = new AMapRef.LngLat(originLng, originLat);
    const dest   = new AMapRef.LngLat(destLng, destLat);
    const cb = (status, result) => {
      if (status === 'complete' && result.routes && result.routes.length > 0) {
        const r = result.routes[0];
        resolve({
          duration: r.time || r.duration || 0, // 秒
          distance: r.distance || 0,            // 米
          steps: r.steps || [],
        });
      } else {
        reject(new Error('路线规划失败：' + status));
      }
    };
    if (mode === 'walking') {
      walkingPlugin.search(origin, dest, cb);
    } else if (mode === 'riding') {
      ridingPlugin.search(origin, dest, cb);
    } else {
      drivingPlugin.search(origin, dest, cb);
    }
  });
}

// =====================================================
//  清除当前地图路线
// =====================================================
function clearActiveRoute() {
  if (drawDriving) drawDriving.clear();
  if (drawWalking) drawWalking.clear();
  if (drawRiding)  drawRiding.clear();
}

// =====================================================
//  地图路线绘制：选中日程时自动规划路线
// =====================================================
function drawRouteToSchedule(id, mode) {
  const s = loadSchedules().find(x => x.id === id);
  if (!s) return;

  mode = mode || s.travelMode || 'driving';
  activeRouteScheduleId = id;
  activeRouteMode = mode;

  // 高亮侧边栏对应卡片
  document.querySelectorAll('.schedule-card').forEach(el => {
    el.classList.toggle('route-active', el.dataset.id === id);
  });

  // 更新路线面板出行方式按钮
  document.querySelectorAll('#rpModeBar .rp-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // 显示面板 loading 状态
  document.getElementById('routePanel').classList.remove('d-none');
  document.getElementById('rpContent').innerHTML = `
    <div class="text-center py-2 text-muted small">
      <div class="spinner-border spinner-border-sm me-1" role="status"></div>
      正在规划路线…
    </div>`;

  // 清除地图上旧路线
  clearActiveRoute();

  function doRoute(loc) {
    const origin = new AMapRef.LngLat(loc.lng, loc.lat);
    const dest   = new AMapRef.LngLat(s.lng, s.lat);
    const plugin = mode === 'walking' ? drawWalking : mode === 'riding' ? drawRiding : drawDriving;

    plugin.search(origin, dest, (status, result) => {
      if (status === 'complete' && result.routes && result.routes.length > 0) {
        const r = result.routes[0];
        const durSec  = r.time || r.duration || 0;
        const durMin  = Math.ceil(durSec / 60);
        const distKm  = ((r.distance || 0) / 1000).toFixed(1);
        const etaDate = new Date(Date.now() + durSec * 1000);
        showRoutePanel(s, mode, durMin, distKm, etaDate, loc);
        // 调整地图视野
        mapInstance.setFitView(null, true);
      } else {
        document.getElementById('rpContent').innerHTML = `
          <div class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>路线规划失败，请重试</div>`;
      }
    });
  }

  if (userLocation) {
    doRoute(userLocation);
  } else {
    getCurrentLocation()
      .then(loc => { userLocation = loc; doRoute(loc); })
      .catch(() => {
        document.getElementById('rpContent').innerHTML = `
          <div class="text-warning small">
            <i class="bi bi-geo me-1"></i>无法获取当前位置，请在浏览器允许定位后重试。
          </div>`;
      });
  }
}

// =====================================================
//  路线面板：渲染路线信息
// =====================================================
function showRoutePanel(schedule, mode, durMin, distKm, etaDate, loc) {
  const modeLabel = { driving: '驾车', walking: '步行', riding: '骑行' }[mode] || '驾车';
  const modeIcon  = { driving: 'bi-car-front', walking: 'bi-person-walking', riding: 'bi-bicycle' }[mode] || 'bi-car-front';
  const etaStr    = fmtTime(etaDate);
  const scheduleTime  = new Date(schedule.time);
  const departMs  = scheduleTime.getTime() - durMin * 60 * 1000 - 10 * 60 * 1000;
  const departDate = new Date(departMs);
  const late = departMs < Date.now();

  document.getElementById('rpContent').innerHTML = `
    <div class="mb-2">
      <div class="rp-route-title">
        <i class="bi bi-cursor-fill text-primary me-1"></i>
        ${loc ? escHtml(loc.address || `${loc.lng.toFixed(4)}, ${loc.lat.toFixed(4)}`) : '当前位置'}
        <i class="bi bi-arrow-right mx-1 text-muted"></i>
        <i class="bi ${modeIcon} text-primary"></i>
      </div>
      <div class="rp-route-dest mt-1">
        <i class="bi bi-flag-fill text-danger me-1"></i>${escHtml(schedule.location || schedule.title)}
      </div>
    </div>
    <div class="d-flex gap-2 mb-2">
      <div class="rp-stat-card">
        <div class="rp-stat-label">预计用时</div>
        <div class="rp-stat-value text-primary">${durMin} 分钟</div>
      </div>
      <div class="rp-stat-card">
        <div class="rp-stat-label">路程距离</div>
        <div class="rp-stat-value">${distKm} 公里</div>
      </div>
      <div class="rp-stat-card">
        <div class="rp-stat-label">预计到达</div>
        <div class="rp-stat-value text-success">${etaStr}</div>
      </div>
    </div>
    ${late
      ? `<div class="alert alert-danger py-1 px-2 mb-1" style="font-size:0.78rem">
           <i class="bi bi-exclamation-triangle me-1"></i>
           已过最佳出发时间！日程：<strong>${fmtTime(scheduleTime)}</strong>
         </div>`
      : `<div class="alert alert-success py-1 px-2 mb-1" style="font-size:0.78rem">
           <i class="bi bi-check2-circle me-1"></i>
           建议 <strong>${fmtTime(departDate)}</strong> 出发（含10分钟缓冲）
         </div>`
    }
    <div class="d-flex justify-content-between align-items-center mt-1">
      <span class="small text-muted">${escHtml(schedule.title)}</span>
      <button class="btn btn-sm btn-outline-info py-0 px-2" onclick="openNavModal('${schedule.id}')" style="font-size:0.75rem">
        <i class="bi bi-signpost-2 me-1"></i>路况详情
      </button>
    </div>`;
}

// =====================================================
//  路线面板：隐藏并清除
// =====================================================
function hideRoutePanel() {
  clearActiveRoute();
  activeRouteScheduleId = null;
  document.getElementById('routePanel').classList.add('d-none');
  document.querySelectorAll('.schedule-card.route-active').forEach(el => el.classList.remove('route-active'));
}
window.hideRoutePanel = hideRoutePanel;
window.drawRouteToSchedule = drawRouteToSchedule;

// =====================================================
//  导航路况弹窗
// =====================================================
function openNavModal(id) {
  const s = loadSchedules().find(x => x.id === id);
  if (!s) return;
  currentNavId = id;

  // 高德导航投和链接
  document.getElementById('openAmapNavBtn').onclick = () => {
    const url = `https://uri.amap.com/navigation?to=${s.lng},${s.lat},${encodeURIComponent(s.location || s.title)}&mode=car&src=webapp&coordinate=gaode`;
    window.open(url, '_blank');
  };

  const modalBody = document.getElementById('navModalBody');
  modalBody.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-info" role="status"></div>
      <div class="mt-2 text-muted">正在获取定位和路况…</div>
    </div>`;

  const modal = new bootstrap.Modal(document.getElementById('navModal'));
  modal.show();

  const mode = s.travelMode || 'driving';
  const modeLabel = { driving: '驾车', walking: '步行', riding: '骑行' }[mode] || '驾车';
  const modeIcon  = { driving: 'bi-car-front', walking: 'bi-person-walking', riding: 'bi-bicycle' }[mode] || 'bi-car-front';

  getCurrentLocation()
    .then(loc => queryRoute(s.lng, s.lat, mode, loc.lng, loc.lat)
      .then(result => ({ loc, result }))
    )
    .then(({ loc, result }) => {
      const durMin  = Math.ceil(result.duration / 60);
      const distKm  = (result.distance / 1000).toFixed(1);
      const scheduleTime = new Date(s.time);
      const departTime   = new Date(scheduleTime.getTime() - result.duration * 1000 - 10 * 60 * 1000);
      const now = new Date();
      const late = departTime < now;

      modalBody.innerHTML = `
        <div class="mb-3 p-3 rounded" style="background:#e8f4fd">
          <div class="fw-semibold mb-1"><i class="bi bi-calendar-event me-1 text-primary"></i>${escHtml(s.title)}</div>
          <div class="small text-muted"><i class="bi bi-flag me-1"></i>目的地：${escHtml(s.location || '未填写')}</div>
          <div class="small text-muted"><i class="bi bi-clock me-1"></i>日程时间：${fmtDatetime(s.time)}</div>
        </div>
        <div class="row g-2 mb-3">
          <div class="col-6">
            <div class="border rounded p-2 text-center">
              <div class="text-muted small">出行方式</div>
              <div class="fw-bold"><i class="bi ${modeIcon} me-1"></i>${modeLabel}</div>
            </div>
          </div>
          <div class="col-6">
            <div class="border rounded p-2 text-center">
              <div class="text-muted small">预计用时</div>
              <div class="fw-bold text-info">${durMin} 分钟</div>
            </div>
          </div>
          <div class="col-6">
            <div class="border rounded p-2 text-center">
              <div class="text-muted small">路程距离</div>
              <div class="fw-bold">${distKm} 公里</div>
            </div>
          </div>
          <div class="col-6">
            <div class="border rounded p-2 text-center">
              <div class="text-muted small">最晚出发</div>
              <div class="fw-bold ${late ? 'text-danger' : 'text-success'}">${fmtTime(departTime)}</div>
            </div>
          </div>
        </div>
        ${late
          ? `<div class="alert alert-danger py-2 mb-2">
               <i class="bi bi-exclamation-triangle me-1"></i>
               <strong>已过最佳出发时间！</strong>现在出发预计 ${durMin} 分钟后到达。
             </div>`
          : `<div class="alert alert-success py-2 mb-2">
               <i class="bi bi-check-circle me-1"></i>
               建议 <strong>${fmtTime(departTime)}</strong> 出发，含 10 分钟缓冲时间。
             </div>`
        }
        <div class="d-flex align-items-center gap-2 mt-2">
          <i class="bi bi-cursor-fill text-primary"></i>
          <span class="small text-muted flex-1">当前位置：${escHtml(loc.address || `${loc.lng.toFixed(4)}, ${loc.lat.toFixed(4)}`)}</span>
          <button class="btn btn-sm btn-outline-secondary" onclick="refreshNavInfo('${id}')">
            <i class="bi bi-arrow-clockwise"></i> 刷新
          </button>
        </div>`;
    })
    .catch(err => {
      modalBody.innerHTML = `
        <div class="alert alert-warning">
          <i class="bi bi-exclamation-triangle me-1"></i>
          ${escHtml(err.message || '获取路况失败，请检查定位权限')}
        </div>
        <div class="small text-muted mb-3">提示：需在浏览器允许定位权限才能查询路况。</div>
        <div class="text-center">
          <button class="btn btn-outline-info" onclick="openNavModal('${id}')">
            <i class="bi bi-arrow-clockwise me-1"></i>重试
          </button>
        </div>`;
    });
}

function refreshNavInfo(id) {
  userLocation = null;
  openNavModal(id);
}

// =====================================================
//  智能出行提醒（每 5 分钟检查一次）
// =====================================================
async function checkSmartReminders() {
  const candidates = loadSchedules().filter(s =>
    s.smartRemind && !smartRemindedSet.has(s.id + '_smart') && scheduleStatus(s) !== 'past'
  );
  if (candidates.length === 0) return;

  let loc;
  try { loc = await getCurrentLocation(); } catch { return; }

  for (const s of candidates) {
    try {
      const mode = s.travelMode || 'driving';
      const result = await queryRoute(s.lng, s.lat, mode, loc.lng, loc.lat);
      const scheduleTime = new Date(s.time).getTime();
      const departMs = scheduleTime - result.duration * 1000 - 10 * 60 * 1000;
      const now = Date.now();
      // 在出发时间前 3 分钟 ~ 后 5 分钟 内触发
      if (now >= departMs - 3 * 60 * 1000 && now <= departMs + 5 * 60 * 1000) {
        smartRemindedSet.add(s.id + '_smart');
        const durMin = Math.ceil(result.duration / 60);
        const modeLabel = { driving: '驾车', walking: '步行', riding: '骑行' }[mode] || '驾车';
        triggerSmartReminder(s, durMin, modeLabel);
      }
    } catch { /* 忽略单个不平的日程 */ }
  }
}

function triggerSmartReminder(schedule, durMin, modeLabel) {
  const msg = `${modeLabel}约 ${durMin} 分钟可到达，建议现在出发！`;

  if (schedule.remindBrowser && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(`🚗 出发提醒：${schedule.title}`, {
      body: `${msg}\n📍 ${schedule.location || ''}`,
      icon: 'https://a.amap.com/pc/static/favicon.ico',
    });
  }
  if (schedule.remindSound) playBeep();

  const container = document.getElementById('toastContainer');
  const toastEl = document.createElement('div');
  toastEl.className = 'toast toast-reminder align-items-center border-0 show';
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="toast-header" style="background:${schedule.color || '#34A853'};color:#fff">
      <i class="bi bi-car-front me-2"></i>
      <strong class="me-auto">出发提醒：${escHtml(schedule.title)}</strong>
      <button type="button" class="btn-close btn-close-white ms-2" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body text-dark bg-white">
      <div>${msg}</div>
      ${schedule.location ? `<div class="text-muted small mt-1"><i class="bi bi-flag me-1"></i>${escHtml(schedule.location)}</div>` : ''}
      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-sm btn-outline-info" onclick="openNavModal('${schedule.id}')"><i class="bi bi-signpost-2 me-1"></i>路况</button>
        <button class="btn btn-sm btn-info text-white" onclick="window.open('https://uri.amap.com/navigation?to=${schedule.lng},${schedule.lat},${encodeURIComponent(schedule.location || schedule.title)}&amp;mode=car&amp;src=webapp&amp;coordinate=gaode','_blank')">导航</button>
      </div>
    </div>`;
  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 15000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// =====================================================
//  侧边栏列表渲染
// =====================================================
function renderList() {
  const listEl = document.getElementById('scheduleList');
  const emptyEl = document.getElementById('emptyState');
  const filter = document.getElementById('filterSelect').value;
  const searchVal = document.getElementById('listSearch').value.trim().toLowerCase();

  let schedules = loadSchedules();

  // 过滤
  if (filter === 'today') {
    schedules = schedules.filter(s => scheduleStatus(s) === 'today' || scheduleStatus(s) === 'soon');
  } else if (filter === 'upcoming') {
    schedules = schedules.filter(s => scheduleStatus(s) === 'upcoming' || scheduleStatus(s) === 'today' || scheduleStatus(s) === 'soon');
  } else if (filter === 'past') {
    schedules = schedules.filter(s => scheduleStatus(s) === 'past');
  }

  // 搜索
  if (searchVal) {
    schedules = schedules.filter(s =>
      s.title.toLowerCase().includes(searchVal) ||
      (s.location || '').toLowerCase().includes(searchVal)
    );
  }

  // 排序：未过期在前，按时间升序
  schedules.sort((a, b) => {
    const sa = scheduleStatus(a) === 'past' ? 1 : 0;
    const sb = scheduleStatus(b) === 'past' ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return new Date(a.time) - new Date(b.time);
  });

  listEl.innerHTML = '';

  if (schedules.length === 0) {
    emptyEl.classList.remove('d-none');
    return;
  }
  emptyEl.classList.add('d-none');

  schedules.forEach(s => {
    const status = scheduleStatus(s);
    const card = document.createElement('div');
    card.className = `schedule-card${status === 'past' ? ' past' : ''}`;
    card.dataset.id = s.id;
    card.innerHTML = `
      <div class="card-color-bar" style="background:${s.color || '#4285F4'}"></div>
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start gap-1">
          <div class="card-title flex-1 me-1">${escHtml(s.title)}</div>
          ${statusBadgeHtml(status)}
        </div>
        <div class="card-time"><i class="bi bi-clock me-1"></i>${fmtDatetime(s.time)}</div>
        ${s.location ? `<div class="card-location"><i class="bi bi-geo-alt me-1"></i>${escHtml(s.location)}</div>` : ''}
        ${s.note ? `<div class="card-note"><i class="bi bi-card-text me-1"></i>${escHtml(s.note)}</div>` : ''}
      </div>`;

    card.addEventListener('click', () => {
      // 飞到地图位置并打开信息窗
      if (mapInstance) {
        mapInstance.setCenter([s.lng, s.lat]);
        mapInstance.setZoom(15);
        openInfoWindow(s);
      }
      // 自动绘制从当前位置到目的地的路线
      drawRouteToSchedule(s.id, s.travelMode || 'driving');
    });

    listEl.appendChild(card);
  });
}

// =====================================================
//  详情弹窗
// =====================================================
function openDetailModal(id) {
  const schedules = loadSchedules();
  const s = schedules.find(x => x.id === id);
  if (!s) return;

  currentDetailId = id;

  const status = scheduleStatus(s);
  const header = document.getElementById('detailModalHeader');
  header.style.background = s.color || '#4285F4';

  document.getElementById('detailModalLabel').textContent = s.title;

  document.getElementById('detailModalBody').innerHTML = `
    <div class="detail-row">
      <i class="bi bi-clock"></i>
      <span class="detail-label">时间</span>
      <span class="detail-value">${fmtDatetime(s.time)}&nbsp;&nbsp;${statusBadgeHtml(status)}</span>
    </div>
    ${s.location ? `
    <div class="detail-row">
      <i class="bi bi-geo-alt"></i>
      <span class="detail-label">地点</span>
      <span class="detail-value">${escHtml(s.location)}</span>
    </div>` : ''}
    <div class="detail-row">
      <i class="bi bi-crosshair2"></i>
      <span class="detail-label">坐标</span>
      <span class="detail-value">${Number(s.lng).toFixed(6)}, ${Number(s.lat).toFixed(6)}</span>
    </div>
    <div class="detail-row">
      <i class="bi bi-bell"></i>
      <span class="detail-label">提醒</span>
      <span class="detail-value">提前 ${s.remindBefore || 0} 分钟</span>
    </div>
    ${s.smartRemind ? `
    <div class="detail-row">
      <i class="bi bi-signpost-2 text-info"></i>
      <span class="detail-label">出行</span>
      <span class="detail-value">智能出行提醒已开启 &middot; ${{ driving: '驾车', walking: '步行', riding: '骑行' }[s.travelMode] || '驾车'}</span>
    </div>` : ''}
    ${s.note ? `
    <div class="detail-row">
      <i class="bi bi-card-text"></i>
      <span class="detail-label">备注</span>
      <span class="detail-value">${escHtml(s.note)}</span>
    </div>` : ''}
  `;

  const modal = new bootstrap.Modal(document.getElementById('detailModal'));
  modal.show();
}

// ===== 详情弹窗里的"编辑"按钮 =====
document.getElementById('editScheduleBtn').addEventListener('click', () => {
  if (!currentDetailId) return;
  const s = loadSchedules().find(x => x.id === currentDetailId);
  if (!s) return;

  // 关闭详情弹窗
  bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();

  // 填充编辑表单
  document.getElementById('editId').value = s.id;
  document.getElementById('editLng').value = s.lng;
  document.getElementById('editLat').value = s.lat;
  document.getElementById('scheduleLng').value = Number(s.lng).toFixed(6);
  document.getElementById('scheduleLat').value = Number(s.lat).toFixed(6);
  document.getElementById('scheduleTitle').value = s.title;
  document.getElementById('scheduleLocation').value = s.location || '';
  document.getElementById('locationSearchInput').value = s.location ? s.location.split(' · ')[0] : '';
  document.getElementById('scheduleTime').value = s.time ? s.time.slice(0, 16) : '';
  document.getElementById('scheduleNote').value = s.note || '';
  document.getElementById('remindBefore').value = String(s.remindBefore || 0);
  document.getElementById('remindBrowser').checked = s.remindBrowser !== false;
  document.getElementById('remindSound').checked = !!s.remindSound;
  document.getElementById('smartRemind').checked = !!s.smartRemind;
  document.getElementById('smartRemindOptions').classList.toggle('d-none', !s.smartRemind);
  document.getElementById('travelTimeResult').textContent = '';
  const modeRadio = document.querySelector(`input[name="travelMode"][value="${s.travelMode || 'driving'}"]`);
  if (modeRadio) modeRadio.checked = true;
  document.getElementById('scheduleColor').value = s.color || '#4285F4';

  // 颜色选中状态
  document.querySelectorAll('.color-dot').forEach(el => {
    el.classList.toggle('active', el.dataset.color === (s.color || '#4285F4'));
  });

  document.getElementById('scheduleModalLabel').innerHTML =
    '<i class="bi bi-pencil me-2"></i>编辑日程';

  const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
  modal.show();
});

// ===== 详情弹窗里的"删除"按钮 =====
document.getElementById('deleteScheduleBtn').addEventListener('click', async () => {
  if (!currentDetailId) return;
  if (!confirm('确认删除此日程？')) return;

  const btn = document.getElementById('deleteScheduleBtn');
  const oldHtml = btn.innerHTML;

  try {
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;

    await window.ScheduleAPI.delete(currentDetailId);
    await fetchSchedules();

    btn.innerHTML = oldHtml;
    btn.disabled = false;

    renderList();
    updateTodayBadge();

    bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();
    showToast('日程已删除', 'success');
  } catch (err) {
    btn.innerHTML = oldHtml;
    btn.disabled = false;
    showToast('删除失败: ' + err.message, 'danger');
  }
});

// ===== 详情弹窗里的"路况"按钮 =====
document.getElementById('navScheduleBtn').addEventListener('click', () => {
  if (!currentDetailId) return;
  bootstrap.Modal.getInstance(document.getElementById('detailModal'))?.hide();
  setTimeout(() => openNavModal(currentDetailId), 350);
});

// =====================================================
//  保存日程（新增 / 编辑）
// =====================================================
document.getElementById('saveScheduleBtn').addEventListener('click', async () => {
  const title = document.getElementById('scheduleTitle').value.trim();
  const time = document.getElementById('scheduleTime').value;
  const lng = parseFloat(document.getElementById('editLng').value);
  const lat = parseFloat(document.getElementById('editLat').value);

  if (!title) {
    alertField('scheduleTitle', '请输入日程标题');
    return;
  }
  if (!time) {
    alertField('scheduleTime', '请选择日程时间');
    return;
  }
  if (isNaN(lng) || isNaN(lat)) {
    showToast('请先在地图上选择地点', 'warning');
    return;
  }

  const id = document.getElementById('editId').value;
  const isEdit = !!id;

  const originalMeta = {
    color: document.getElementById('scheduleColor').value || '#4285F4',
    remindBefore: parseInt(document.getElementById('remindBefore').value) || 0,
    remindBrowser: document.getElementById('remindBrowser').checked,
    remindSound: document.getElementById('remindSound').checked,
    smartRemind: document.getElementById('smartRemind').checked,
    travelMode: document.querySelector('input[name="travelMode"]:checked')?.value || 'driving'
  };

  const rawNote = document.getElementById('scheduleNote').value.trim();
  const description = `###META###${JSON.stringify(originalMeta)}\\n${rawNote}`;

  // time 格式为 "YYYY-MM-DDTHH:mm"，后端要求 ISO 格式
  const isoTime = time + ':00';

  const scheduleData = {
    title,
    location_name: document.getElementById('scheduleLocation').value.trim() || '未命名位置',
    lng,
    lat,
    start_time: isoTime,
    end_time: isoTime, // 前端暂无结束时间输入，同步起点
    description: description,
    amap_poi_id: ''
  };

  const btn = document.getElementById('saveScheduleBtn');
  const oldHtml = btn.innerHTML;

  try {
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 保存中...';
    btn.disabled = true;

    if (isEdit) {
      scheduleData.id = parseInt(id) || id;
      await window.ScheduleAPI.update(scheduleData);
    } else {
      await window.ScheduleAPI.create(scheduleData);
    }

    await fetchSchedules(); // 从后端刷新整体列表及 Marker
    
    btn.innerHTML = oldHtml;
    btn.disabled = false;

    renderList();
    updateTodayBadge();

    bootstrap.Modal.getInstance(document.getElementById('scheduleModal')).hide();
    showToast(isEdit ? '日程已更新 ✓' : '日程已添加 ✓', 'success');

    // 飞到新位置
    if (mapInstance && typeof mapInstance.setCenter === 'function') {
      mapInstance.setCenter([lng, lat]);
      mapInstance.setZoom(15);
    }
  } catch (err) {
    btn.innerHTML = oldHtml;
    btn.disabled = false;
    showToast('保存失败: ' + err.message, 'danger');
  }
});

function alertField(id, msg) {
  const el = document.getElementById(id);
  el.classList.add('is-invalid');
  el.focus();
  // 移除提示
  el.addEventListener('input', () => el.classList.remove('is-invalid'), { once: true });
  showToast(msg, 'warning');
}

// =====================================================
//  重置弹窗表单
// =====================================================
function resetModalForm(keepCoord) {
  document.getElementById('scheduleTitle').value = '';
  document.getElementById('scheduleNote').value = '';
  // 默认时间：当天下一个整点
  const now = new Date();
  now.setHours(now.getHours() + 1, 0, 0, 0);
  document.getElementById('scheduleTime').value = toLocalISOString(now);

  document.getElementById('remindBefore').value = '15';
  document.getElementById('remindBrowser').checked = true;
  document.getElementById('remindSound').checked = false;
  document.getElementById('smartRemind').checked = false;
  document.getElementById('smartRemindOptions').classList.add('d-none');
  document.getElementById('travelTimeResult').textContent = '';
  document.getElementById('locationSuggestList').classList.add('d-none');
  document.getElementById('scheduleColor').value = '#4285F4';
  document.querySelectorAll('.color-dot').forEach(el => {
    el.classList.toggle('active', el.dataset.color === '#4285F4');
  });

  if (!keepCoord) {
    document.getElementById('editId').value = '';
    document.getElementById('editLng').value = '';
    document.getElementById('editLat').value = '';
    document.getElementById('scheduleLng').value = '';
    document.getElementById('scheduleLat').value = '';
    document.getElementById('scheduleLocation').value = '';
    document.getElementById('locationSearchInput').value = '';
  }

  // 清除校验状态
  document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
}

function toLocalISOString(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// =====================================================
//  颜色选择器
// =====================================================
document.getElementById('colorPicker').addEventListener('click', e => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  document.querySelectorAll('.color-dot').forEach(el => el.classList.remove('active'));
  dot.classList.add('active');
  document.getElementById('scheduleColor').value = dot.dataset.color;
});

// =====================================================
//  智能出行提醒开关
// =====================================================
document.getElementById('smartRemind').addEventListener('change', function () {
  document.getElementById('smartRemindOptions').classList.toggle('d-none', !this.checked);
});

// =====================================================
//  弹窗内不行时间查询按鈕
// =====================================================
document.getElementById('queryTravelBtn').addEventListener('click', () => {
  const lng = parseFloat(document.getElementById('editLng').value);
  const lat = parseFloat(document.getElementById('editLat').value);
  if (isNaN(lng) || isNaN(lat)) {
    showToast('请先选择目的地', 'warning');
    return;
  }
  const mode = document.querySelector('input[name="travelMode"]:checked')?.value || 'driving';
  const resultEl = document.getElementById('travelTimeResult');
  resultEl.innerHTML = '<span class="text-muted">查询中…</span>';

  getCurrentLocation()
    .then(loc => queryRoute(lng, lat, mode, loc.lng, loc.lat))
    .then(result => {
      const durMin = Math.ceil(result.duration / 60);
      const distKm = (result.distance / 1000).toFixed(1);
      resultEl.innerHTML = `<span class="text-success fw-semibold">${durMin} 分钟 &middot; ${distKm} 公里</span>`;
      // 自动设置提前提醒时间为公逃 + 10min
      const suggest = durMin + 10;
      const options = [...document.getElementById('remindBefore').options];
      let best = options[options.length - 1].value;
      let bestDiff = Infinity;
      options.forEach(o => {
        const diff = Math.abs(parseInt(o.value) - suggest);
        if (diff < bestDiff) { bestDiff = diff; best = o.value; }
      });
      document.getElementById('remindBefore').value = best;
      showToast(`行程约 ${durMin} 分钟，提前提醒已设为 ${best} 分钟`, 'info');
    })
    .catch(err => {
      resultEl.innerHTML = '<span class="text-danger">查询失败</span>';
      showToast(err.message || '路况查询失败，请检查定位权限', 'warning');
    });
});

// =====================================================
//  顶部"新增日程"按钮（默认北京中心）
// =====================================================
document.getElementById('addScheduleBtn').addEventListener('click', () => {
  if (!mapInstance) {
    showToast('地图尚未加载，请稍候', 'warning');
    return;
  }
  // 使用地图当前中心作为默认坐标
  const center = mapInstance.getCenter();
  pendingLng = center.getLng();
  pendingLat = center.getLat();

  document.getElementById('editId').value = '';
  document.getElementById('editLng').value = pendingLng;
  document.getElementById('editLat').value = pendingLat;
  document.getElementById('scheduleLng').value = pendingLng.toFixed(6);
  document.getElementById('scheduleLat').value = pendingLat.toFixed(6);

  resetModalForm(true);
  document.getElementById('scheduleLocation').value = '';

  if (geocoder) {
    geocoder.getAddress([pendingLng, pendingLat], (status, result) => {
      if (status === 'complete' && result.regeocode) {
        document.getElementById('scheduleLocation').value =
          result.regeocode.formattedAddress || '';
      }
    });
  }

  document.getElementById('scheduleModalLabel').innerHTML =
    '<i class="bi bi-calendar-plus me-2"></i>新增日程';
  new bootstrap.Modal(document.getElementById('scheduleModal')).show();
});

// =====================================================
//  地点搜索按钮
// =====================================================
document.getElementById('searchBtn').addEventListener('click', () => {
  const keyword = document.getElementById('searchInput').value.trim();
  if (!keyword) return;
  if (placeSearch) placeSearch.search(keyword);
});

document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('searchBtn').click();
});

// =====================================================
//  过滤 & 搜索
// =====================================================
document.getElementById('filterSelect').addEventListener('change', renderList);
document.getElementById('listSearch').addEventListener('input', renderList);

// =====================================================
//  今日提醒按钮
// =====================================================
document.getElementById('todayBtn').addEventListener('click', () => {
  const today = loadSchedules().filter(s => {
    const st = scheduleStatus(s);
    return st === 'today' || st === 'soon';
  });

  const body = document.getElementById('todayModalBody');
  if (today.length === 0) {
    body.innerHTML = '<p class="text-muted text-center py-3">今日暂无日程</p>';
  } else {
    body.innerHTML = today.map(s => `
      <div class="d-flex align-items-start gap-3 border-bottom pb-2 mb-2">
        <div class="rounded" style="width:4px;min-height:40px;background:${s.color || '#4285F4'}"></div>
        <div class="flex-1">
          <div class="fw-semibold">${escHtml(s.title)}</div>
          <div class="text-muted small"><i class="bi bi-clock me-1"></i>${fmtDatetime(s.time)}</div>
          ${s.location ? `<div class="text-muted small"><i class="bi bi-geo-alt me-1"></i>${escHtml(s.location)}</div>` : ''}
        </div>
        <button class="btn btn-sm btn-outline-primary" onclick="locateSchedule('${s.id}')">定位</button>
      </div>`).join('');
  }

  new bootstrap.Modal(document.getElementById('todayModal')).show();
});

function locateSchedule(id) {
  const s = loadSchedules().find(x => x.id === id);
  if (!s || !mapInstance) return;
  bootstrap.Modal.getInstance(document.getElementById('todayModal'))?.hide();
  mapInstance.setCenter([s.lng, s.lat]);
  mapInstance.setZoom(15);
  setTimeout(() => openInfoWindow(s), 400);
}

function updateTodayBadge() {
  const count = loadSchedules().filter(s => {
    const st = scheduleStatus(s);
    return st === 'today' || st === 'soon';
  }).length;
  const badge = document.getElementById('todayBadge');
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.classList.remove('d-none');
  } else {
    badge.classList.add('d-none');
  }
}

// =====================================================
//  提醒定时器（每分钟检查一次）
// =====================================================
function startReminderTimer() {
  // 请求浏览器通知权限
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  checkReminders();
  checkSmartReminders();
  setInterval(checkReminders, 60 * 1000);
  setInterval(checkSmartReminders, 5 * 60 * 1000);
}

function checkReminders() {
  const schedules = loadSchedules();
  const now = Date.now();

  schedules.forEach(s => {
    if (!s.time) return;
    const scheduleTime = new Date(s.time).getTime();
    const remindTime = scheduleTime - (s.remindBefore || 0) * 60 * 1000;
    const diff = remindTime - now;

    // 在提醒时间前后 90 秒内触发（防止漏检）
    if (diff >= -90 * 1000 && diff <= 90 * 1000 && !remindedSet.has(s.id)) {
      remindedSet.add(s.id);
      triggerReminder(s);
    }
  });
}

function triggerReminder(schedule) {
  const msg = (schedule.remindBefore > 0)
    ? `距离日程开始还有 ${schedule.remindBefore} 分钟`
    : '日程即将开始';

  // 浏览器通知
  if (schedule.remindBrowser && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(`📅 ${schedule.title}`, {
      body: `${msg}\n📍 ${schedule.location || '无地点信息'}`,
      icon: 'https://a.amap.com/pc/static/favicon.ico',
    });
  }

  // 声音提醒
  if (schedule.remindSound) {
    playBeep();
  }

  // Toast 提醒（始终显示）
  showReminderToast(schedule, msg);

  // 刷新徽标
  updateTodayBadge();
}

function showReminderToast(schedule, msg) {
  const container = document.getElementById('toastContainer');
  const id = 'toast_' + genId();
  const toastEl = document.createElement('div');
  toastEl.id = id;
  toastEl.className = 'toast toast-reminder align-items-center border-0 show';
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="toast-header" style="background:${schedule.color || '#4285F4'};color:#fff">
      <i class="bi bi-bell-fill me-2"></i>
      <strong class="me-auto">${escHtml(schedule.title)}</strong>
      <small>${fmtDatetime(schedule.time)}</small>
      <button type="button" class="btn-close btn-close-white ms-2" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body text-dark bg-white">
      <div>${msg}</div>
      ${schedule.location ? `<div class="text-muted small mt-1"><i class="bi bi-geo-alt me-1"></i>${escHtml(schedule.location)}</div>` : ''}
      <button class="btn btn-sm btn-outline-primary mt-2" onclick="locateSchedule('${schedule.id}')">
        <i class="bi bi-map me-1"></i>在地图上查看
      </button>
    </div>`;

  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 10000 });
  toast.show();

  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

/** 简单的 beep 声 */
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch (_) {}
}

// =====================================================
//  通用 Toast 提示
// =====================================================
function showToast(message, type = 'info') {
  const colorMap = {
    success: 'bg-success',
    warning: 'bg-warning text-dark',
    danger: 'bg-danger',
    info: 'bg-info text-dark',
  };
  const container = document.getElementById('toastContainer');
  const id = 'toast_' + genId();
  const el = document.createElement('div');
  el.id = id;
  el.className = `toast align-items-center text-white border-0 show ${colorMap[type] || 'bg-secondary'}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;

  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 3000 });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

// =====================================================
//  全局暴露供 HTML onclick 调用
// =====================================================
window.openDetailModal = openDetailModal;
window.closeInfoWindow = closeInfoWindow;
window.locateSchedule = locateSchedule;
window.openNavModal = openNavModal;
window.refreshNavInfo = refreshNavInfo;

// =====================================================
//  路线面板交互绑定
// =====================================================
document.getElementById('closeRoutePanelBtn').addEventListener('click', hideRoutePanel);

document.getElementById('rpModeBar').addEventListener('click', e => {
  const btn = e.target.closest('.rp-mode-btn');
  if (!btn || !activeRouteScheduleId) return;
  const mode = btn.dataset.mode;
  if (mode === activeRouteMode) return;
  drawRouteToSchedule(activeRouteScheduleId, mode);
});

// =====================================================
//  账号验证相关逻辑 (authArea & authModal)
// =====================================================
function checkAuthStatus() {
  const isAuth = window.AuthAPI && window.AuthAPI.isLoggedIn();
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userNameDisplay = document.getElementById('userNameDisplay');

  if (isAuth) {
    loginBtn.classList.add('d-none');
    logoutBtn.classList.remove('d-none');
    // 解码 jwt 取用户名，或只显示 已登录
    let username = '已登录';
    try {
      const token = localStorage.getItem('nexto_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.sub) username = payload.sub;
      }
    } catch(e) {}
    userNameDisplay.textContent = username;
    userNameDisplay.classList.remove('d-none');
  } else {
    loginBtn.classList.remove('d-none');
    logoutBtn.classList.add('d-none');
    userNameDisplay.classList.add('d-none');
  }
}

document.getElementById('loginBtn').addEventListener('click', e => {
  e.preventDefault();
  new bootstrap.Modal(document.getElementById('authModal')).show();
});

document.getElementById('logoutBtn').addEventListener('click', async e => {
  e.preventDefault();
  if (!confirm('确认注销吗？')) return;
  try {
    await window.AuthAPI.logout();
    checkAuthStatus();
    _currentSchedules.forEach(s => removeMarkerFromMap(s.id));
    _currentSchedules = [];
    renderList();
    updateTodayBadge();
    showToast('已注销', 'info');
  } catch (err) {
    showToast('注销失败: ' + err.message, 'warning');
  }
});

document.getElementById('doLoginBtn').addEventListener('click', async () => {
  const user = document.getElementById('loginUsername').value.trim();
  const pass = document.getElementById('loginPassword').value.trim();
  if (!user || !pass) return showToast('用户名和密码不能为空', 'warning');

  const btn = document.getElementById('doLoginBtn');
  const oldText = btn.textContent;
  btn.textContent = '登录中...';
  btn.disabled = true;

  try {
    await window.AuthAPI.login(user, pass);
    bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
    showToast('登录成功', 'success');
    checkAuthStatus();
    await fetchSchedules(); // fetch from server as soon as valid login
  } catch (err) {
    showToast('登录失败: ' + err.message, 'danger');
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
});

document.getElementById('doRegisterBtn').addEventListener('click', async () => {
  const email = document.getElementById('regEmail').value.trim();
  const user = document.getElementById('regUsername').value.trim();
  const pass = document.getElementById('regPassword').value.trim();
  if (!user || !pass || !email) return showToast('注册信息填写不完整', 'warning');

  const btn = document.getElementById('doRegisterBtn');
  const oldText = btn.textContent;
  btn.textContent = '注册中...';
  btn.disabled = true;

  try {
    await window.AuthAPI.register(user, pass, email);
    showToast('注册成功，请切换到登录页面进行登录', 'success');
    document.getElementById('login-tab').click();
    document.getElementById('loginUsername').value = user;
    document.getElementById('loginPassword').value = '';
  } catch (err) {
    showToast('注册失败: ' + err.message, 'danger');
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
});

// =====================================================
//  启动
// =====================================================
checkAuthStatus();
initMap();

