# Map asset storage

This repository intentionally does not bundle development map packs or satellite imagery unless redistribution permissions have been confirmed for each asset.

For local Windows use, upload an SVG you own or are licensed to use through **Map Library → Upload map**. User map assets are stored under this folder.

For Vercel preview deployments, runtime uploads are redirected to temporary `/tmp` storage. They are not durable. Configure persistent object storage before relying on hosted uploads.
