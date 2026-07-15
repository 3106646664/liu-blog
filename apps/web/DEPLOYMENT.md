# Xinghui Blog Deployment

- The local CMS copies content into this frontend repository and pushes `main` to GitHub.
- The Aliyun server checks GitHub every two minutes using a read-only deploy key.
- New commits are built in an isolated release directory before the active release is switched.
- `xinghui-blog.service` serves Next.js on `127.0.0.1:3000`; Nginx exposes the site on ports 80 and 443.
- The local CMS is not required for normal website operation and can remain closed.
