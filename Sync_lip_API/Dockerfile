# Dockerfile

# 1. Choose a lightweight Python base image
FROM python:3.8-slim

# 2. Set a working directory in the container
WORKDIR /app

# 3. Copy only requirements first (for caching). 
#    Assumes app/requirements.txt exists
COPY ./requirements.txt .

# 4. Install system-level dependencies (if any)
#    For many basic apps, no extra apt-get is needed. 
#    Example (uncomment if you need build dependencies):
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get install -y ffmpeg
# RUN apt-get update && \
#     apt-get install -y --no-install-recommends build-essential && \
#     rm -rf /var/lib/apt/lists/*

# 5. Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 6. Copy the rest of the application code
COPY . /app

# 7. Expose the port Uvicorn will run on
EXPOSE 8000

# # 8. Specify environment variables (optional)
# ENV PYTHONUNBUFFERED=1 \
#     PYTHONDONTWRITEBYTECODE=1

# 9. Final command to run the API server
#    Adjust if you use a different module path.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
