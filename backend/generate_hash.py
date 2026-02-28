from passlib.context import CryptContext

# Initialize the context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# The password you want to hash
password_to_hash = "owner@123"

# Generate the hash
hashed_password = pwd_context.hash(password_to_hash)

print(f"Password: {password_to_hash}")
print(f"Generated Hash: {hashed_password}")
