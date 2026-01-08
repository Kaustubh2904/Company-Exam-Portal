from datetime import datetime, timedelta
from typing import Optional
import hashlib
import secrets
from jose import JWTError, jwt
from fastapi import HTTPException, status
from app.database.config import settings

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash using PBKDF2"""
    try:
        # Split the stored hash to get salt and hash
        salt, stored_hash = hashed_password.split(':')
        # Hash the plain password with the same salt
        password_hash = hashlib.pbkdf2_hmac('sha256', 
                                          plain_password.encode('utf-8'),
                                          bytes.fromhex(salt),
                                          100000)
        return stored_hash == password_hash.hex()
    except (ValueError, AttributeError):
        return False

def get_password_hash(password: str) -> str:
    """Hash a password using PBKDF2"""
    # Generate a random salt
    salt = secrets.token_hex(32)
    # Hash the password with the salt
    password_hash = hashlib.pbkdf2_hmac('sha256',
                                      password.encode('utf-8'),
                                      bytes.fromhex(salt),
                                      100000)
    # Return salt:hash format
    return f"{salt}:{password_hash.hex()}"

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

def verify_token(token: str):
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
