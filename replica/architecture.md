# Architecture
Vanilla HTML/CSS/JS, DOM media objects with transform viewport; no WebGL dependency. IndexedDB stores local media/workspace for durable uploads, with explicit JSON export. Separate reusable state/validation/arrangement module tested in Node. Pointer drag + keyboard object movement, pan/zoom, local asset/reference picker, local storyboard preview. BytePlus generation adapter preserves server-only credentials and explicitly reports unavailable backend; does not use the reference product API.

Build: dependency-free static Site at dist/index.html and assets; Node-hosting source adapter can serve static editor and existing BytePlus endpoints. No fabricated generation results.

Standalone Node server includes existing original LAKON BytePlus API and private disk storage; generation endpoints require studio authentication before assigning a trusted owner identity. Static hosted publication has no configured API backend and is labeled as an editor preview.
