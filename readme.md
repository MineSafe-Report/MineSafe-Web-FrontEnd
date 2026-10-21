# MineSafe web frontend

Plain HTML, CSS and JavaScript dashboards for Safety Officers and Administrators. The pages connect to the existing ASP.NET API.

## Local preview

1. Start the backend on `http://localhost:5080`.
2. In this repository run `node dev-server.js`.
3. Open `http://127.0.0.1:5500` and sign in with a Safety Officer or Administrator account.
4. If the API address changes, edit `apiBaseUrl` in `api-config.js`. The future Cloudflare address can go there. The browser must be able to reach that address, and the backend must permit the web origin through CORS. `localhost` works only when the browser and backend run on the same PC.

The server uses only Node.js built-in modules. Stop it with Ctrl+C.

## Pages

- `sign-in.html`: sign-in form and role-based navigation. The local server also serves it at `/`.
- `so-dashboard.html`: Safety Officer search and filters beside a scrollable report table. View report opens full details and attachments in the same panel; the audit log link stays on the right.
- `so-audit.html`: selected report audit log.
- `admin.html`: administration landing page.
- `admin-accounts.html`: searchable account list with Edit and Deactivate actions.
- `admin-account-create.html`: create an account.
- `admin-account-edit.html`: update an account or deactivate it.
- `admin-locations.html`: searchable location list with Update and Deactivate actions.
- `admin-location-create.html`: create a location, then return to the location list.
- `admin-location-edit.html`: update a location or deactivate it.

The pages verify the session and role through `GET /api/auth/me`. Log out removes the token from browser session storage. The account and location list, create and edit pages share fixed search and navigation areas; their content area scrolls separately. Edit links open a form for the selected record. Deactivation asks for confirmation and uses the backend's soft-delete route.

## Available API pathways

`api.js` exposes `window.MineSafeApi` on every page. It uses the backend's real routes:

| Client call | Backend route |
| --- | --- |
| `auth.login(login, password)` | `POST /api/auth/login` |
| `auth.me()` | `GET /api/auth/me` |
| `accounts.list/get/create/update/deactivate` | `GET/POST/PUT/DELETE /api/accounts` |
| `roles.list()` | `GET /api/roles` |
| `locations.list/get/create/update/deactivate` | `GET/POST/PUT/DELETE /api/locations` |
| `reports.list/get/audit` | `GET /api/reports`, `/api/reports/{id}`, and `/api/reports/{id}/audit` |
| `attachments.download(id)` | `GET /api/attachments/{id}` |

The sign-in result is held in browser session storage and sent as a Bearer token for protected calls. `auth.logout()` clears it. Account updates must send the full list of selected roles and locations; items left out are switched off by the backend. Deactivate calls use the backend's soft-delete routes.

The account and location form fields follow the current backend request models. The Safety Officer dashboard loads the reports available to that role, searches by report number, description, reporter name, location, type and status, and offers type filtering, sorting and paging in the report table. Evidence downloads use the Bearer token and display images or playable audio. The backend must grant Safety Officers read access to all report types for the Hazards and Near Misses filters to show those reports. This permission change is running in the separate local backend staging copy and still needs integration into the backend repository.

The local preview server redirects old page names (`index.html`, `so-incidents.html`, and `so-incident.html`) to the new pages, preserving a report ID in the query string. A separate static host needs matching redirect rules if old bookmarks must keep working there.

The preview server is for local development. Before deployment, serve the files through a web host with HTTPS and configure the Cloudflare API address and web origin.
