# Split Bill Application

This repository contains AI-based application for splitting-bill, written on python (streamlit) and can be run on your local computer. 

Courtesy of: https://github.com/MukhlasAdib

## Features

With this application, you can upload a photo of your receipt. The AI will read the receipt and show you the data.

![receipt-data-page](figs/receipt-data-page.jpg)

Then, you can list participants of your split-bill, and then assign items from the receipt to each of them.

![assign-page](figs/assign-page.jpg)

When you are done, final report will be shown.

![report-page](figs/report-page.jpg)

## Installation

1. Make sure Python is installed (any recent version should be fine, I tested with Python 3.12)
2. Create environment for this application

with virtualenv:

```bash
    pip install virtualenv
    python -m virtualenv .ven
```
with uv:

```bash
    uv sync
```

3. Activate the environment

if using Linux

```bash
    source .venv/bin/activate
```

if using Windows

```powershell
    .\.venv\Scripts\activate
```

4. Install required libraries

with virtualenv:

```bash
    pip install -r requirements.txt
```
with uv:

```bash
    uv sync
```

## Run Application

1. Activate the environment

if using Linux

```bash
    source .venv/bin/activate
```

if using Windows

```powrshell
    .\.venv\Scripts\activate
```

2. Start the app

with virtualenv:

```bash
    streamlit run app.py
```

with uv:


```bash
    uv run streamlit run app.py
```
