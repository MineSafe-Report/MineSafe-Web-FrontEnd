(function () {
  "use strict";

  const baseUrl = (window.MineSafeConfig?.apiBaseUrl || "http://localhost:5080").replace(/\/+$/, "");
  const sessionKey = "minesafe.web.auth";

  class ApiError extends Error {
    constructor(message, status, details) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  }

  function readSession() {
    const saved = window.sessionStorage.getItem(sessionKey);
    if (!saved) return null;

    try {
      const session = JSON.parse(saved);
      const expiry = Date.parse(session.expiresAt);
      if (!session.token || !Number.isFinite(expiry) || expiry <= Date.now()) {
        window.sessionStorage.removeItem(sessionKey);
        return null;
      }
      return session;
    } catch {
      window.sessionStorage.removeItem(sessionKey);
      return null;
    }
  }

  function saveSession(result) {
    const expiry = Date.parse(result?.expiresAt);
    if (!result?.token || !Number.isFinite(expiry) || expiry <= Date.now() || !result?.user) {
      throw new ApiError("The sign-in response is missing required information.", 0, result);
    }
    window.sessionStorage.setItem(sessionKey, JSON.stringify({
      token: result.token,
      expiresAt: result.expiresAt,
      user: result.user
    }));
  }

  function requireId(id) {
    const number = Number(id);
    if (!Number.isSafeInteger(number) || number <= 0) {
      throw new TypeError("An ID must be a positive whole number.");
    }
    return number;
  }

  function buildUrl(path, query) {
    const url = new URL(path, baseUrl + "/");
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  async function request(method, path, options = {}) {
    const { query, body, auth = true } = options;
    const headers = { Accept: "application/json" };

    if (auth) {
      const token = readSession()?.token;
      if (!token) throw new ApiError("Please sign in again.", 401);
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      throw new ApiError(`Cannot reach the MineSafe API at ${baseUrl}.`, 0, error);
    }

    const responseText = await response.text();
    let data = null;
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        if (response.ok) throw new ApiError("The API returned an unreadable response.", response.status);
      }
    }

    if (!response.ok) {
      if (auth && response.status === 401) window.sessionStorage.removeItem(sessionKey);
      throw new ApiError(
        data?.message || data?.title || response.statusText || "The API request failed.",
        response.status,
        data
      );
    }
    return data;
  }

  async function download(path) {
    const token = readSession()?.token;
    if (!token) throw new ApiError("Please sign in again.", 401);
    let response;
    try {
      response = await fetch(buildUrl(path), { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      throw new ApiError(`Cannot reach the MineSafe API at ${baseUrl}.`, 0, error);
    }
    if (!response.ok) {
      if (response.status === 401) window.sessionStorage.removeItem(sessionKey);
      throw new ApiError(`Could not load attachment (${response.status}).`, response.status);
    }
    return response.blob();
  }

  window.MineSafeApi = Object.freeze({
    baseUrl,
    ApiError,
    auth: Object.freeze({
      async login(login, password) {
        const result = await request("POST", "/api/auth/login", {
          auth: false,
          body: { login, password }
        });
        saveSession(result);
        return result;
      },
      me() {
        return request("GET", "/api/auth/me");
      },
      logout() {
        window.sessionStorage.removeItem(sessionKey);
      },
      currentUser() {
        return readSession()?.user || null;
      },
      isSignedIn() {
        return readSession() !== null;
      }
    }),
    accounts: Object.freeze({
      list(filters = {}) {
        return request("GET", "/api/accounts", { query: filters });
      },
      get(id) {
        return request("GET", `/api/accounts/${requireId(id)}`);
      },
      create(account) {
        return request("POST", "/api/accounts", { body: account });
      },
      update(id, account) {
        return request("PUT", `/api/accounts/${requireId(id)}`, { body: account });
      },
      deactivate(id) {
        return request("DELETE", `/api/accounts/${requireId(id)}`);
      }
    }),
    roles: Object.freeze({
      list() {
        return request("GET", "/api/roles");
      }
    }),
    locations: Object.freeze({
      list(filters = {}) {
        return request("GET", "/api/locations", { query: filters });
      },
      get(id) {
        return request("GET", `/api/locations/${requireId(id)}`);
      },
      create(location) {
        return request("POST", "/api/locations", { body: location });
      },
      update(id, location) {
        return request("PUT", `/api/locations/${requireId(id)}`, { body: location });
      },
      deactivate(id) {
        return request("DELETE", `/api/locations/${requireId(id)}`);
      }
    }),
    reports: Object.freeze({
      list(filters = {}) {
        return request("GET", "/api/reports", { query: filters });
      },
      get(id) {
        return request("GET", `/api/reports/${requireId(id)}`);
      },
      audit(id) {
        return request("GET", `/api/reports/${requireId(id)}/audit`);
      }
    }),
    attachments: Object.freeze({
      download(id) {
        return download(`/api/attachments/${requireId(id)}`);
      }
    })
  });
}());
