.PHONY: build serve

build:
	uv run python tools/build_site/build.py

serve: build
	python3 -m http.server 8080 -d site
