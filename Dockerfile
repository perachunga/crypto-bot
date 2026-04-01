FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

ENV DB_PATH=/data/crypto_bot.db

EXPOSE 8001

CMD ["python", "src/main.py"]
