# SplitBill v2 API
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

RUN useradd -m -u 1000 appuser && mkdir -p /data && chown appuser:appuser /data /app
USER appuser

EXPOSE 8300
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8300"]
