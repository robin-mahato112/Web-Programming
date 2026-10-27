# University API and checkout in Postman

Import `University-Checkout.postman_collection.json` and one matching environment:

| Environment                                    | API                    | Website Origin        | Purchase request                            |
| ---------------------------------------------- | ---------------------- | --------------------- | ------------------------------------------- |
| `University-Main.postman_environment.json`     | http://localhost:13001 | http://localhost:3000 | Always blocked by collection guard          |
| `University-Isolated.postman_environment.json` | http://localhost:13002 | http://localhost:3002 | Disabled until `allowIsolatedPurchase=true` |

The supplied v1.1 ZIP and updated university collection are the reference for generic CRUD. This folder contains an 11-request collection focused on Products/Cart/Checkout and its two environments; credentials are blank. Request **05b** reads the signed-in patron's order lines through the new `ProductsInOrders` endpoint. Checkout still uses the transactional extension; generic order-line writes do not replace it.

## Demo sequence

1. Send **01 BookGenre** to show a real university list response. Product reads are paginated; **02** shows the first page. **03** reads the chosen `Stocktake.ItemId` and current source/stock/price.
2. Set `patronEmail` and `patronPassword` privately to an existing customer in the selected database. If needed, first run `npm.cmd run setup:customer` using private `.env.local` settings for that API, as described in the project README. Send **04 login**, then **05 session**. The Postman cookie jar stores the HttpOnly cookie. Browser and Postman sessions are separate.
3. Set `itemId` and a positive whole `quantity`; **06 prepare** obtains current SQL prices and saves the returned reviewed listing identities. This template uses a synthetic delivery address.
4. Select `paymentResult`: `approved`, `declined` (default), or `timed-out`; send **07**. Only local simulator card fixtures are used; never enter real cards. The server returns a signed reference.
5. For a final purchase demonstration, use the **isolated** environment only and explicitly set `allowIsolatedPurchase=true`. Sending **08** with approval creates an isolated order and reduces stock. The collection blocks port 13001 even if that switch is enabled. The server still enforces ownership, price and stock independently of this client guard.
6. **09** reads the saved result. Before any confirm it correctly returns `not-found`. After an interrupted confirm, use **09** and/or repeat **08** with the same saved `confirmBody`; do not prepare a new attempt. **10** ends the Postman session.

Do not export populated private environments. The shared templates contain no passwords or session/payment tokens. Postman may display request bodies in its own console; use simulator fixtures and keep that console out of screenshots.

The collection scripts and main/isolated purchase guards have automated tests. Equivalent requests are replayed against the isolated API with confirm disabled; Postman desktop interaction itself has not been automated. A skipped confirmation is not evidence of order creation. Browser purchase evidence is documented separately.

## Search and stock management

Request **12** performs SQL keyword search. For **13**, set `adminUsername` and `adminPassword` privately to an existing administrator; it uses `/login`, not `/patronLogin`. **14** reads source-specific stock. For **15**, use isolated port 13002, explicitly set `allowIsolatedStockEdit=true`, and enter the current `expectedStock` and intended `newStock` for `itemId`. The server rejects changed quantities with 409. Reload **14** before retrying; never blindly repeat after a timeout. Main stock writes are blocked by this collection. The website admin form can deliberately update main stock when using port 3000.

Stock changes use the existing schema. No delete, product-creation or price-edit request was added. Log out before switching back to a customer session.

## Combined management endpoints

The collection also includes product creation, atomic source-listing edits, protected product deletion and staff editing/removal. Sign in as an administrator first. Set productId/staffUserId and managementBody from the README contract. Management writes require isolated baseUrl 13002 and allowIsolatedManagementEdit=true; the default is false. Product deletion cannot erase order history.

The original university workspace under postman/ remains a reference for generic resources. Generic Product/Stocktake/order writes and staff edits/deletes are deliberately denied by the installed extension; use the current management/checkout requests instead. Credentials are private environment values, not saved examples.
