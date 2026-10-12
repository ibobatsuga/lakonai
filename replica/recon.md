# Canvas reference reconnaissance
2026-10-12. Scope: web Canvas core loop, original LAKON branding, desktop-first responsive.

Sources: https://studio.morphic.com/editor/demo/canvas?locale=id (direct manual UI); https://morphic.com/docs/getting-started; https://morphic.com/docs/getting-started/assets/upload-assets; https://morphic.com/docs/image/text-to-image; https://morphic.com/docs/image/multi-image-to-image; https://morphic.com/docs/getting-started/copilot.

Observed: dark neutral header; 260 px sidebar; project/file breadcrumb; three view tabs; select/hand tool dropdown; collapsible sidebar. Reference main canvas refuses this browser because graphics hardware acceleration is unavailable. No visual equivalence score claimed for the rendered canvas.

Documented: free-flowing canvas, prompt bar below, select image for editing, multi-image reference selection, assets panel/upload, arrange grid/horizontal/vertical, Copilot chat. This canvas uses media objects; wires/nodes are not an observed feature.

S01 Canvas populated/empty, S02 assets panel, S03 reference picker, S04 inspector/settings, S05 assistant brief, S06 storyboard preview, S07 import/export dialogs.
F01 import → canvas → arrange → select/edit settings → save/export. F02 choose references → brief → backend generation if available. F03 frames → storyboard preview. F04 project switch, undo/redo, restore after reload.

Entities: Workspace(projects,activeId), Project(id,name,nodes,timeline,view,brief), Media(id,name,src,type), CanvasObject(id,type,x,y,w,h,assetId,text,role), Clip(assetId,duration). Local workspace persistence; owner-only server data on hosted version if configured.

Outside scope: original source/private APIs, licensed media, credits/payments, organization/team infrastructure, AI conversation and rendered video outputs without a configured provider. Seed visuals are previously user-supplied LAKON assets.

## 2026-10-12 — Create / Floating Canvas / Assets layout
Four user-supplied Dreamina screenshots inspected: Canvas dashboard; Generate AI Video composer; floating canvas editor; chronological assets. Rebuilt structural behavior independently using Lakon logo and orange accent. No reference photography, logo, code, licensed typeface or private API copied. User expressly requested a plain starting state and provided routing/UI specification. Sidebar: Create, Explore, Assets, Elements, Past creations, Canvases. Generate mode tabs: AI Agent, AI Video, AI Image, AI Audio, AI Avatar; bottom model/reference/format/duration/mention/credit/submit row. Canvas uses floating project/actions/vertical insertion tools/footer/Chats; no fixed site sidebar.
