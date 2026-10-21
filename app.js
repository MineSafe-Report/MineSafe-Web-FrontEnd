(function () {
  "use strict";

  const api = window.MineSafeApi;
  const page = location.pathname.split("/").pop() || "sign-in.html";
  const $ = (id) => document.getElementById(id);
  const value = (id) => $(id).value.trim();
  const checkedIds = (id) => Array.from($(id).querySelectorAll('input[type="checkbox"]:checked'), (input) => Number(input.value));
  const date = (input) => input ? new Date(input).toLocaleString() : "—";
  const text = (id, content) => { $(id).textContent = content ?? "—"; };
  const message = (id, content) => { text(id, content); };
  const errorMessage = (error) => {
    if (error.details?.code === "INVALID_LOGIN") return error.message;
    if (error.status === 401) return "Your session ended. Sign in again.";
    if (error.status === 403) return "Your account cannot access this information.";
    if (error.details?.errors) {
      return Object.values(error.details.errors).flat().join(" ");
    }
    return error.message || "The request failed. Please try again.";
  };
  const cell = (row, content) => {
    const td = document.createElement("td");
    td.textContent = content ?? "—";
    row.append(td);
    return td;
  };
  const option = (select, id, label, chosen = false) => {
    const item = new Option(label, String(id), false, chosen);
    select.add(item);
  };
  const setOptions = (id, items, idKey, nameKey, keepFirst = false) => {
    const control = $(id);
    const first = keepFirst ? control.options[0].cloneNode(true) : null;
    control.replaceChildren();
    if (first) control.add(first);
    for (const item of items) option(control, item[idKey], item[nameKey]);
  };
  const setCheckboxes = (id, items, idKey, nameKey) => {
    const control = $(id);
    control.replaceChildren();
    for (const item of items) {
      const label = document.createElement("label");
      label.className = "checkbox-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = String(item[idKey]);
      label.append(input, document.createTextNode(item[nameKey]));
      control.append(label);
    }
  };
  const show = (id, visible) => { $(id).hidden = !visible; };
  const defaultId = (id) => value(id) ? Number(value(id)) : null;
  const queryId = () => Number(new URLSearchParams(location.search).get("id"));

  function targetFor(user) {
    if (user.roles?.includes("Administrator")) return "admin.html";
    if (user.roles?.includes("SafetyOfficer")) return "so-dashboard.html";
    return null;
  }

  function wireLogout() {
    for (const link of document.querySelectorAll("[data-logout]")) {
      link.addEventListener("click", () => api.auth.logout());
    }
  }

  async function guard(role) {
    if (!api.auth.isSignedIn()) {
      location.replace("sign-in.html");
      return false;
    }
    try {
      const user = await api.auth.me();
      if (!user.roles?.includes(role)) {
        location.replace(targetFor(user) || "sign-in.html");
        return false;
      }
      return true;
    } catch {
      api.auth.logout();
      location.replace("sign-in.html");
      return false;
    }
  }

  function loginPage() {
    $("login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      message("login-message", "Signing in...");
      try {
        const result = await api.auth.login(value("login"), $("password").value);
        const target = targetFor(result.user);
        if (!target) {
          api.auth.logout();
          message("login-message", "The web dashboard is available to Safety Officers and Administrators.");
          return;
        }
        location.assign(target);
      } catch (error) {
        message("login-message", errorMessage(error));
      } finally {
        button.disabled = false;
      }
    });
  }

  async function adminHome() {
    const results = await Promise.allSettled([
      api.accounts.list(), api.locations.list({ includeInactive: true })
    ]);
    text("account-summary", results[0].status === "fulfilled"
      ? `${results[0].value.length} accounts` : errorMessage(results[0].reason));
    text("location-summary", results[1].status === "fulfilled"
      ? `${results[1].value.length} locations` : errorMessage(results[1].reason));
  }

  function accountPayload(prefix, existingRoles = []) {
    const role = value(`${prefix}-role`);
    const roles = role === "keep" ? existingRoles.map((item) => item.roleId) : (role ? [Number(role)] : []);
    const locations = checkedIds(`${prefix}-locations`);
    const defaultLocationId = defaultId(`${prefix}-default-location`);
    if (!roles.length) throw new Error("Select at least one role.");
    if (defaultLocationId && !locations.includes(defaultLocationId)) {
      throw new Error("The default location must also be an assigned location.");
    }
    return {
      fullName: value(`${prefix}-full-name`), email: value(`${prefix}-email`),
      roleIds: roles, locationIds: locations, defaultLocationId
    };
  }

  function adminListUrl(kind) {
    const pageName = kind === "account" ? "admin-accounts.html" : "admin-locations.html";
    const params = new URLSearchParams(window.location.search);
    params.delete("id");
    const query = params.toString();
    return pageName + (query ? `?${query}` : "");
  }

  function restoreAdminFilters(kind, roles = []) {
    const params = new URLSearchParams(window.location.search);
    const isAccount = kind === "account";
    const prefix = isAccount ? "account" : "location";
    const search = $(`${prefix}-search`);
    search.value = params.get("search") || "";
    $(`${prefix}-active-filter`).value = params.get("status") || "all";
    if (isAccount) {
      setOptions("account-role-filter", roles, "roleId", "roleName", true);
      $("account-role-filter").value = params.get("roleId") || "";
    }
    $(`clear-${prefix}-filters`).addEventListener("click", () => {
      location.assign(isAccount ? "admin-accounts.html" : "admin-locations.html");
    });
    $(`refresh-${prefix}s`).addEventListener("click", () => location.reload());
    const listUrl = adminListUrl(kind);
    const preserved = new URLSearchParams(params);
    preserved.delete("id");
    for (const link of document.querySelectorAll(".admin-create-pane a")) {
      if (link.getAttribute("href") === (isAccount ? "admin-accounts.html" : "admin-locations.html")) {
        link.href = listUrl;
      } else if (preserved.toString()) {
        link.href += `?${preserved}`;
      }
    }
  }

  async function accountListPage() {
    try {
      restoreAdminFilters("account", await api.roles.list());
    } catch (error) {
      restoreAdminFilters("account");
      message("account-list-message", errorMessage(error));
    }
    const list = async () => {
      message("account-list-message", "Loading accounts...");
      try {
        const status = value("account-active-filter");
        const accounts = await api.accounts.list({
          search: value("account-search"), roleId: value("account-role-filter"),
          includeInactive: status !== "active"
        });
        const visible = status === "inactive" ? accounts.filter((item) => !item.isActive) : accounts;
        $("account-rows").replaceChildren();
        for (const account of visible) {
          const row = document.createElement("tr");
          cell(row, account.workerId);
          cell(row, account.fullName);
          cell(row, account.email);
          cell(row, account.roles.map((role) => role.roleName).join(", "));
          cell(row, account.locations.map((loc) => loc.locationName).join(", "));
          cell(row, account.isActive ? "Active" : "Inactive");
          const action = cell(row, "");
          const group = document.createElement("div");
          group.className = "admin-row-actions";
          const edit = document.createElement("a");
          const params = new URLSearchParams(window.location.search);
          params.set("id", String(account.accountId));
          edit.href = `admin-account-edit.html?${params}`;
          edit.className = "button-link";
          edit.textContent = "Edit";
          group.append(edit);
          if (account.isActive) {
            const deactivate = document.createElement("button");
            deactivate.type = "button";
            deactivate.className = "danger-button";
            deactivate.textContent = "Deactivate";
            deactivate.addEventListener("click", async () => {
              if (!confirm(`Deactivate ${account.workerId}? They will no longer be able to sign in.`)) return;
              try {
                await api.accounts.deactivate(account.accountId);
                await list();
                message("account-list-message", `${account.workerId} deactivated.`);
              } catch (error) { message("account-list-message", errorMessage(error)); }
            });
            group.append(deactivate);
          }
          action.append(group);
          $("account-rows").append(row);
        }
        message("account-list-message", visible.length
          ? `${visible.length} account${visible.length === 1 ? "" : "s"} shown.`
          : "No accounts match these filters.");
      } catch (error) { message("account-list-message", errorMessage(error)); }
    };
    await list();
  }

  async function accountCreatePage() {
    try {
      const [roles, locations] = await Promise.all([api.roles.list(), api.locations.list({ includeInactive: true })]);
      restoreAdminFilters("account", roles);
      const activeLocations = locations.filter((loc) => loc.isActive);
      setOptions("create-role", roles, "roleId", "roleName", true);
      setCheckboxes("create-locations", activeLocations, "locationId", "locationName");
      const syncDefault = () => {
        const previous = $("create-default-location").value;
        const chosen = new Set(checkedIds("create-locations"));
        setOptions("create-default-location", activeLocations.filter((loc) => chosen.has(loc.locationId)), "locationId", "locationName", true);
        $("create-default-location").value = chosen.has(Number(previous)) ? previous : "";
      };
      $("create-locations").addEventListener("change", syncDefault);
      $("create-account-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        message("create-account-message", "Creating account...");
        try {
          await api.accounts.create({
            ...accountPayload("create"),
            workerId: value("create-worker-id"),
            password: $("create-password").value
          });
          event.currentTarget.reset();
          syncDefault();
          message("create-account-message", "Account created.");
        } catch (error) { message("create-account-message", errorMessage(error)); }
      });
    } catch (error) {
      message("create-account-message", errorMessage(error));
      $("create-account-form").querySelector('button[type="submit"]').disabled = true;
    }
  }

  async function accountEditPage() {
    const id = queryId();
    if (!Number.isSafeInteger(id) || id <= 0) {
      message("selected-account-message", "Choose an account from the account list.");
      return;
    }
    let account;
    try {
      const [roles, locations, selected] = await Promise.all([
        api.roles.list(), api.locations.list({ includeInactive: true }), api.accounts.get(id)
      ]);
      account = selected;
      restoreAdminFilters("account", roles);
      setCheckboxes("edit-locations", locations, "locationId", "locationName");
      const syncDefault = () => {
        const previous = $("edit-default-location").value;
        const chosen = new Set(checkedIds("edit-locations"));
        setOptions("edit-default-location", locations.filter((loc) => chosen.has(loc.locationId)), "locationId", "locationName", true);
        $("edit-default-location").value = chosen.has(Number(previous)) ? previous : "";
      };
      $("edit-locations").addEventListener("change", syncDefault);
      const populate = (selected) => {
        account = selected;
        $("edit-account-id").value = String(id);
        $("edit-worker-id").value = selected.workerId;
        $("edit-full-name").value = selected.fullName;
        $("edit-email").value = selected.email;
        $("edit-active").value = String(selected.isActive);
        $("edit-new-password").value = "";
        setOptions("edit-role", roles, "roleId", "roleName", true);
        if (selected.roles.length > 1) {
          const names = selected.roles.map((role) => role.roleName).join(", ");
          $("edit-role").add(new Option(`Keep current roles (${names})`, "keep"), 1);
          $("edit-role").value = "keep";
        } else $("edit-role").value = String(selected.roles[0]?.roleId || "");
        const locationIds = new Set(selected.locations.map((loc) => loc.locationId));
        for (const input of $("edit-locations").querySelectorAll('input[type="checkbox"]')) {
          input.checked = locationIds.has(Number(input.value));
        }
        syncDefault();
        $("edit-default-location").value = String(selected.locations.find((loc) => loc.isDefault)?.locationId || "");
        $("edit-account-form").querySelector('button[type="submit"]').disabled = false;
        $("deactivate-account").disabled = !selected.isActive;
        message("selected-account-message", `Editing ${selected.workerId}.`);
      };
      populate(selected);
      $("edit-account-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (account.isActive && value("edit-active") === "false"
          && !confirm(`Deactivate ${account.workerId}? They will no longer be able to sign in.`)) return;
        message("edit-account-message", "Saving account...");
        try {
          const payload = { ...accountPayload("edit", account.roles), isActive: value("edit-active") === "true" };
          if ($("edit-new-password").value) payload.newPassword = $("edit-new-password").value;
          const updated = await api.accounts.update(id, payload);
          populate(updated);
          message("edit-account-message", "Account saved.");
        } catch (error) { message("edit-account-message", errorMessage(error)); }
      });
      $("deactivate-account").addEventListener("click", async () => {
        if (!confirm(`Deactivate ${account.workerId}? They will no longer be able to sign in.`)) return;
        try {
          await api.accounts.deactivate(id);
          populate(await api.accounts.get(id));
          message("edit-account-message", "Account deactivated.");
        } catch (error) { message("edit-account-message", errorMessage(error)); }
      });
    } catch (error) {
      message("selected-account-message", errorMessage(error));
    }
  }

  function locationPayload(prefix) {
    return {
      locationCode: value(`${prefix}-location-code`),
      locationName: value(`${prefix}-location-name`),
      locationInfo: value(`${prefix}-location-info`)
    };
  }

  async function locationListPage() {
    restoreAdminFilters("location");
    const list = async () => {
      message("location-list-message", "Loading locations...");
      try {
        const status = value("location-active-filter");
        const locations = await api.locations.list({
          search: value("location-search"), includeInactive: status !== "active"
        });
        const visible = status === "inactive" ? locations.filter((loc) => !loc.isActive) : locations;
        $("location-rows").replaceChildren();
        for (const location of visible) {
          const row = document.createElement("tr");
          cell(row, location.locationId);
          cell(row, location.locationName);
          cell(row, location.locationCode);
          cell(row, location.locationInfo);
          cell(row, location.isActive ? "Active" : "Inactive");
          const action = cell(row, "");
          const group = document.createElement("div");
          group.className = "admin-row-actions";
          const edit = document.createElement("a");
          const params = new URLSearchParams(window.location.search);
          params.set("id", String(location.locationId));
          edit.href = `admin-location-edit.html?${params}`;
          edit.className = "button-link";
          edit.textContent = "Update";
          group.append(edit);
          if (location.isActive) {
            const deactivate = document.createElement("button");
            deactivate.type = "button";
            deactivate.className = "danger-button";
            deactivate.textContent = "Deactivate";
            deactivate.addEventListener("click", async () => {
              if (!confirm(`Deactivate ${location.locationName}?`)) return;
              try {
                await api.locations.deactivate(location.locationId);
                await list();
                message("location-list-message", `${location.locationName} deactivated.`);
              } catch (error) { message("location-list-message", errorMessage(error)); }
            });
            group.append(deactivate);
          }
          action.append(group);
          $("location-rows").append(row);
        }
        const created = new URLSearchParams(window.location.search).has("created");
        message("location-list-message", visible.length
          ? `${created ? "Location added. " : ""}${visible.length} location${visible.length === 1 ? "" : "s"} shown.`
          : "No locations match these filters.");
      } catch (error) { message("location-list-message", errorMessage(error)); }
    };
    await list();
  }

  async function locationCreatePage() {
    restoreAdminFilters("location");
    $("create-location-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      message("create-location-message", "Creating location...");
      try {
        await api.locations.create(locationPayload("create"));
        window.location.assign("admin-locations.html?created=1");
      } catch (error) { message("create-location-message", errorMessage(error)); }
    });
  }

  async function locationEditPage() {
    restoreAdminFilters("location");
    const id = queryId();
    if (!Number.isSafeInteger(id) || id <= 0) {
      message("selected-location-message", "Choose a location from the location list.");
      return;
    }
    try {
      let selected = await api.locations.get(id);
      const populate = (location) => {
        selected = location;
        $("edit-location-id").value = String(id);
        $("edit-location-code").value = location.locationCode;
        $("edit-location-name").value = location.locationName;
        $("edit-location-info").value = location.locationInfo || "";
        $("edit-location-active").value = String(location.isActive);
        $("edit-location-form").querySelector('button[type="submit"]').disabled = false;
        $("deactivate-location").disabled = !location.isActive;
        message("selected-location-message", `Editing ${location.locationName}.`);
      };
      populate(selected);
      $("edit-location-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (selected.isActive && value("edit-location-active") === "false"
          && !confirm(`Deactivate ${selected.locationName}?`)) return;
        message("edit-location-message", "Saving location...");
        try {
          populate(await api.locations.update(id, {
            ...locationPayload("edit"), isActive: value("edit-location-active") === "true"
          }));
          message("edit-location-message", "Location saved.");
        } catch (error) { message("edit-location-message", errorMessage(error)); }
      });
      $("deactivate-location").addEventListener("click", async () => {
        if (!confirm(`Deactivate ${selected.locationName}?`)) return;
        try {
          await api.locations.deactivate(id);
          populate(await api.locations.get(id));
          message("edit-location-message", "Location deactivated.");
        } catch (error) { message("edit-location-message", errorMessage(error)); }
      });
    } catch (error) { message("selected-location-message", errorMessage(error)); }
  }

  async function safetyOfficerDashboard() {
    const visiblePerPage = 20;
    let results = [];
    let currentPage = 1;
    let initialSelection = queryId();
    let loadVersion = 0;
    const sortedResults = () => {
      const reports = [...results];
      const time = (report) => Date.parse(report.submittedAt) || 0;
      if (value("report-sort") === "oldest") reports.sort((a, b) => time(a) - time(b));
      else if (value("report-sort") === "type") reports.sort((a, b) =>
        a.incidentType.localeCompare(b.incidentType) || time(b) - time(a));
      else reports.sort((a, b) => time(b) - time(a));
      return reports;
    };
    const renderList = () => {
      const reports = sortedResults();
      const pages = Math.max(1, Math.ceil(reports.length / visiblePerPage));
      currentPage = Math.min(currentPage, pages);
      $("report-rows").replaceChildren();
      for (const report of reports.slice((currentPage - 1) * visiblePerPage, currentPage * visiblePerPage)) {
        const row = document.createElement("tr");
        cell(row, report.reportNumber);
        cell(row, report.incidentType);
        cell(row, report.locationName);
        cell(row, report.status);
        cell(row, date(report.submittedAt));
        const action = cell(row, "");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "View report";
        button.setAttribute("aria-label", `View report ${report.reportNumber}`);
        button.addEventListener("click", () => selectReport(report.reportId));
        action.append(button);
        $("report-rows").append(row);
      }
      text("report-page-count", `Page ${currentPage} of ${pages}`);
      $("previous-reports").disabled = currentPage === 1;
      $("next-reports").disabled = currentPage === pages;
    };
    const showReportTable = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("id");
      window.history.replaceState(null, "", url);
      $("report-table-view").hidden = false;
      $("report-detail-view").hidden = true;
      $("so-results-panel")?.scrollTo({ top: 0 });
      clearReportDetail("Choose View report to see its details.");
    };
    const selectReport = (id) => {
      const url = new URL(window.location.href);
      url.searchParams.set("id", String(id));
      window.history.replaceState(null, "", url);
      $("report-table-view").hidden = true;
      $("report-detail-view").hidden = false;
      $("so-results-panel")?.scrollTo({ top: 0 });
      loadReport(id);
    };
    const load = async () => {
      const version = ++loadVersion;
      message("report-list-message", "Loading reports...");
      try {
        const filters = {
          locationId: value("search-location"),
          status: value("search-status"), typeCode: value("report-type-filter"), pageSize: 100
        };
        const fetchAll = async (query) => {
          const first = await api.reports.list({ ...query, page: 1 });
          if (version !== loadVersion) return;
          const found = [...first.items];
          for (let pageNumber = 2; found.length < first.total; pageNumber += 1) {
            const next = await api.reports.list({ ...query, page: pageNumber });
            if (version !== loadVersion) return;
            if (!next.items.length) break;
            found.push(...next.items);
            message("report-list-message", `Loading reports... ${found.length} of ${first.total}`);
          }
          return found;
        };
        const all = await fetchAll(filters);
        if (version !== loadVersion) return;
        const query = value("report-search").toLocaleLowerCase();
        let reports = all;
        if (query) {
          const descriptionMatches = await fetchAll({ ...filters, search: query });
          if (version !== loadVersion) return;
          const matchingIds = new Set(descriptionMatches.map((report) => report.reportId));
          reports = all.filter((report) => matchingIds.has(report.reportId) ||
            [report.reportNumber, report.reporterName, report.locationName, report.incidentType, report.status]
              .some((field) => field?.toLocaleLowerCase().includes(query)));
        }
        results = reports;
        currentPage = 1;
        message("report-list-message", reports.length
          ? `${reports.length} report${reports.length === 1 ? "" : "s"} found.`
          : "No reports match these filters.");
        const target = Number.isSafeInteger(initialSelection) && initialSelection > 0
          ? initialSelection : null;
        initialSelection = null;
        renderList();
        if (target && reports.some((report) => report.reportId === target)) {
          selectReport(target);
        } else {
          showReportTable();
        }
      } catch (error) {
        if (version === loadVersion) message("report-list-message", errorMessage(error));
      }
    };
    $("report-search-filters").addEventListener("submit", (event) => { event.preventDefault(); load(); });
    $("back-to-reports").addEventListener("click", showReportTable);
    $("clear-report-search").addEventListener("click", () => {
      $("report-search-filters").reset();
      load();
    });
    $("refresh-reports").addEventListener("click", () => load());
    $("report-type-filter").addEventListener("change", () => load());
    $("report-sort").addEventListener("change", () => { currentPage = 1; renderList(); showReportTable(); });
    $("previous-reports").addEventListener("click", () => { currentPage -= 1; renderList(); });
    $("next-reports").addEventListener("click", () => { currentPage += 1; renderList(); });
    try {
      const locations = await api.locations.list();
      setOptions("search-location", locations, "locationId", "locationName", true);
    } catch (error) { message("report-list-message", errorMessage(error)); }
    await load();
  }

  let reportLoadVersion = 0;
  let attachmentUrls = [];
  const clearAttachmentUrls = () => {
    attachmentUrls.forEach((url) => URL.revokeObjectURL(url));
    attachmentUrls = [];
  };
  window.addEventListener("pagehide", clearAttachmentUrls);

  function clearReportDetail(notice) {
    reportLoadVersion += 1;
    clearAttachmentUrls();
    if ($("detail-title")) text("detail-title", "Choose a report");
    for (const id of ["report-id", "report-status", "report-type", "report-location", "report-submitted", "report-worker", "report-description"]) text(id, "—");
    if ($("report-occurred")) text("report-occurred", "—");
    if ($("report-review-reason")) {
      text("report-review-reason", "—");
      $("report-review-reason").hidden = true;
      $("report-review-reason-label").hidden = true;
    }
    $("report-images").replaceChildren();
    $("report-voice-notes").replaceChildren();
    message("image-message", "No images loaded.");
    message("voice-message", "No voice notes loaded.");
    $("audit-link").hidden = true;
    if ($("report-action-message")) message("report-action-message", "Select a report to see available actions.");
    message("report-detail-message", notice);
  }

  async function loadReport(id) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      message("report-detail-message", "Choose a report from the list.");
      return;
    }
    const version = ++reportLoadVersion;
    clearAttachmentUrls();
    $("report-images").replaceChildren();
    $("report-voice-notes").replaceChildren();
    $("audit-link").hidden = true;
    if ($("report-action-message")) message("report-action-message", "Loading report actions...");
    if ($("detail-title")) text("detail-title", "Loading report...");
    message("report-detail-message", "Loading report...");
    try {
      const { report } = await api.reports.get(id);
      if (version !== reportLoadVersion) return;
      if ($("detail-title")) text("detail-title", report.reportNumber);
      text("report-id", report.reportNumber);
      text("report-status", report.status);
      text("report-type", report.incidentType);
      text("report-location", report.locationName);
      if ($("report-occurred")) text("report-occurred", date(report.occurredAt));
      text("report-submitted", date(report.submittedAt));
      text("report-worker", `${report.reporterName} (${report.reporterWorkerId})`);
      text("report-description", report.description);
      if ($("report-review-reason")) {
        const hasReason = Boolean(report.reviewReason);
        text("report-review-reason", report.reviewReason);
        $("report-review-reason").hidden = !hasReason;
        $("report-review-reason-label").hidden = !hasReason;
      }
      $("audit-link").href = `so-audit.html?id=${id}`;
      $("audit-link").hidden = false;
      if ($("report-action-message")) message("report-action-message", "Open the report history in the audit log.");
      const images = report.attachments.filter((item) => item.attachmentType === "PHOTO" || item.attachmentType === "IMAGE");
      const voices = report.attachments.filter((item) => item.attachmentType === "VOICE_NOTE");
      message("image-message", images.length ? `${images.length} image(s)` : "No images attached.");
      message("voice-message", voices.length ? `${voices.length} voice note(s)` : "No voice notes attached.");
      const renderFile = async (item, listId, kind) => {
        const li = document.createElement("li");
        li.textContent = `Loading ${item.originalFileName || kind}...`;
        $(listId).append(li);
        try {
          const blob = await api.attachments.download(item.attachmentId);
          const url = URL.createObjectURL(blob);
          if (version !== reportLoadVersion) {
            URL.revokeObjectURL(url);
            return;
          }
          attachmentUrls.push(url);
          const media = document.createElement(kind === "image" ? "img" : "audio");
          media.src = url;
          if (kind === "image") {
            media.alt = item.originalFileName || "Report image";
            media.className = "report-image";
          } else {
            media.controls = true;
            media.preload = "none";
          }
          const filename = document.createElement("span");
          filename.textContent = item.originalFileName || `${kind} ${item.attachmentId}`;
          const download = document.createElement("a");
          download.href = url;
          download.download = item.originalFileName || `${kind}-${item.attachmentId}`;
          download.textContent = "Download";
          li.replaceChildren(filename, download, media);
        } catch (error) {
          if (version === reportLoadVersion) li.textContent = `${item.originalFileName || kind}: ${errorMessage(error)}`;
        }
      };
      for (const item of images) renderFile(item, "report-images", "image");
      for (const item of voices) renderFile(item, "report-voice-notes", "audio");
      message("report-detail-message", "");
    } catch (error) {
      if (version === reportLoadVersion) {
        message("report-detail-message", errorMessage(error));
        if ($("report-action-message")) message("report-action-message", "Report actions are unavailable.");
      }
    }
  }

  async function auditPage() {
    const id = queryId();
    if (!Number.isSafeInteger(id) || id <= 0) {
      message("audit-message", "Choose a report from the dashboard.");
      return;
    }
    $("back-to-report").href = `so-dashboard.html?id=${id}`;
    message("audit-message", "Loading audit log...");
    try {
      const entries = await api.reports.audit(id);
      $("audit-rows").replaceChildren();
      for (const entry of entries) {
        const row = document.createElement("tr");
        cell(row, date(entry.actionAt));
        cell(row, entry.action);
        cell(row, entry.actorName);
        cell(row, entry.newValueJson || entry.oldValueJson || "—");
        $("audit-rows").append(row);
      }
      message("audit-message", entries.length ? `${entries.length} audit entries.` : "No audit entries for this report.");
    } catch (error) { message("audit-message", errorMessage(error)); }
  }

  async function main() {
    if (page === "sign-in.html") { loginPage(); return; }
    const role = page.startsWith("admin") ? "Administrator" : "SafetyOfficer";
    if (!await guard(role)) return;
    wireLogout();
    if (page === "admin.html") await adminHome();
    if (page === "admin-accounts.html") await accountListPage();
    if (page === "admin-account-create.html") await accountCreatePage();
    if (page === "admin-account-edit.html") await accountEditPage();
    if (page === "admin-locations.html") await locationListPage();
    if (page === "admin-location-create.html") await locationCreatePage();
    if (page === "admin-location-edit.html") await locationEditPage();
    if (page === "so-dashboard.html") await safetyOfficerDashboard();
    if (page === "so-audit.html") await auditPage();
  }

  main().catch((error) => {
    const notice = document.querySelector('main [role="status"]');
    if (notice) notice.textContent = errorMessage(error);
  });
}());
