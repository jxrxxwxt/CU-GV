# ใช้ Python เป็น base image
FROM python:3.11-alpine

# ติดตั้ง lib ที่จำเป็น
RUN apk add --no-cache netcat-openbsd

# ตั้ง working directory
WORKDIR /app

# คัดลอก requirements.txt และติดตั้ง
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# คัดลอกโค้ดทั้งหมดไปใน container
COPY . .

# เปิดพอร์ต
EXPOSE 8000