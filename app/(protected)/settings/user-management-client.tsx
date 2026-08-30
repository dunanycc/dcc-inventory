"use client";

import { changeUserRoleAction, preauthorizeUserAction, setUserStatusAction } from "./actions";
import { ROLES, type AppRole } from "@/lib/authorization";

const roleLabels: Record<AppRole, string> = {
  ADMINISTRATOR: "Administrator",
  INVENTORY_MANAGER: "Inventory Manager",
  INVENTORY_USER: "Starter Shack Staff",
  READ_ONLY: "Read Only",
};

export type UserManagementRow = {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
  status: "ACTIVE" | "DISABLED";
  providers: string[];
  createdAt: string;
  lastActivity: string | null;
};

export function UserManagementClient({ users }: { users: UserManagementRow[] }) {
  return (
    <div className="user-management">
      <section className="admin-panel preauthorize-panel">
        <div>
          <p className="eyebrow">Approved access</p>
          <h2>Pre-authorize a user</h2>
          <p>The verified Google or Yahoo email must exactly match this approved address.</p>
        </div>
        <form action={preauthorizeUserAction} className="preauthorize-form">
          <label>Name <span>Optional</span><input maxLength={160} name="name" placeholder="Member name" /></label>
          <label>Email<input autoComplete="off" maxLength={320} name="email" placeholder="member@example.com" required type="email" /></label>
          <label>Role<select defaultValue="READ_ONLY" name="role">{ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
          <button className="admin-primary" type="submit">Pre-authorize user</button>
        </form>
      </section>

      <section className="admin-panel users-panel">
        <div className="table-toolbar">
          <div><h2>Inventory users</h2><p>{users.length} approved {users.length === 1 ? "account" : "accounts"}</p></div>
        </div>
        <div className="table-scroll">
          <table className="user-table">
            <thead><tr><th>User</th><th>Status</th><th>Identity</th><th>Created</th><th>Last activity</th><th>Role and access</th></tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td data-label="User"><strong>{user.name || "Name not provided"}</strong><small>{user.email}</small></td>
                <td data-label="Status"><span className={`status-pill ${user.status === "ACTIVE" ? "" : "muted-pill"}`}>{user.status === "ACTIVE" ? "Active" : "Disabled"}</span></td>
                <td data-label="Identity">{user.providers.length ? user.providers.join(", ") : <span className="table-muted">Not signed in</span>}</td>
                <td data-label="Created">{user.createdAt}</td>
                <td data-label="Last activity">{user.lastActivity ?? <span className="table-muted">Not yet</span>}</td>
                <td data-label="Role and access">
                  <div className="user-actions">
                    <form action={changeUserRoleAction} onSubmit={(event) => { if (!window.confirm(`Change ${user.email}'s role?`)) event.preventDefault(); }}>
                      <input name="userId" type="hidden" value={user.id} />
                      <select aria-label={`Role for ${user.email}`} defaultValue={user.role} name="role">{ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>
                      <button className="admin-secondary" type="submit">Save role</button>
                    </form>
                    <form action={setUserStatusAction} onSubmit={(event) => { if (user.status === "ACTIVE" && !window.confirm(`Disable access for ${user.email}?`)) event.preventDefault(); }}>
                      <input name="userId" type="hidden" value={user.id} />
                      <input name="status" type="hidden" value={user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                      <button className={user.status === "ACTIVE" ? "admin-danger" : "admin-secondary"} type="submit">{user.status === "ACTIVE" ? "Disable" : "Enable"}</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
