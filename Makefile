.PHONY: dev build preview test

dev:
	cd web && npm run dev

build:
	cd web && npm run build

preview: build
	cd web && npm run preview

test:
	cd core && npm test
