# Role Permissions

This is a Sprint 1 planning model, not implemented authorization. Final permissions must be confirmed before authentication or database work.

| Capability | Customer | Employee | Administrator |
| --- | :---: | :---: | :---: |
| Browse products and view details | Yes | Yes, read only | Yes |
| Search catalogue | Yes | Yes, read only | Yes |
| Manage own cart | Yes | No | No |
| Register, sign in, manage own profile | Yes | No | No |
| View internal catalogue page | No | Yes, read only | Yes |
| Create/edit/archive products | No | No | Planned |
| View/manage user roles | No | No | Planned |
| Access admin dashboard | No | No | Planned |

“Planned” means a visible page prototype exists, but secure authorization and write actions do not. Server-side checks will be required; hiding a link in React is not access control.
