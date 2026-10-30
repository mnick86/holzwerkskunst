# Holzwerkskunst

### Image studio

With Node.js 22+ and dependencies installed, run `npm run start:image` to build and open the product-image studio.
Enter and save your API key in the studio's **API-Schlüssel** settings (browser Local Storage).
The studio runs entirely in the browser and calls OpenAI directly; hosting needs no Node.js backend.
The GitHub Action includes it at `https://holzwerkskunst.de/image/` after the next deployment.
`npm run build:image` bundles the official [OpenAI JavaScript SDK](https://github.com/openai/openai-node)
and prepares the public assets in `dist/bootstrap/image/` for static hosting.
Node.js is only needed for local npm commands and the repository's build, not for the hosted studio.
See [image-studio/README.md](image-studio/README.md) for setup, the three-column workflow, and checks.

### DNS

original all-inkl A-Record was: 85.13.144.110. Delete CName as well
