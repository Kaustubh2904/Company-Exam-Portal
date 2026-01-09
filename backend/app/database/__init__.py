from app.database.connection import Base, engine, SessionLocal
from app.models import Admin, Company, Drive, Question, College, StudentGroup, Student
import logging

logger = logging.getLogger(__name__)

def create_tables():
    """Create all database tables"""
    Base.metadata.create_all(bind=engine)
    
    # Seed initial data after creating tables
    seed_initial_data()

def drop_tables():
    """Drop all database tables"""
    Base.metadata.drop_all(bind=engine)

def seed_initial_data():
    """Seed database with initial colleges and student groups"""
    db = SessionLocal()
    try:
        # Check if data already exists
        if db.query(College).count() > 0:
            return
        
        # Predefined colleges
        colleges = [
            "IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kanpur", "IIT Kharagpur",
            "BITS Pilani", "NIT Trichy", "NIT Warangal", "IIIT Hyderabad",
            "Delhi University", "Mumbai University", "Pune University",
            "VIT Vellore", "Manipal Institute of Technology", "SRM University",
            "IIIT Bangalore", "NIT Surathkal", "NIT Calicut", "Anna University",
            "Jadavpur University", "Banaras Hindu University", "Aligarh Muslim University",
            "Jamia Millia Islamia", "Cochin University of Science and Technology"
        ]
        
        # Predefined student groups
        student_groups = [
            "Computer Science Engineering (CSE)",
            "Information Technology (IT)",
            "Electronics and Communication Engineering (ECE)",
            "Electrical Engineering (EEE)",
            "Mechanical Engineering (ME)",
            "Civil Engineering (CE)",
            "Chemical Engineering (CHE)",
            "Biotechnology (BT)",
            "Aerospace Engineering (AE)",
            "Data Science and Engineering",
            "Artificial Intelligence and Machine Learning",
            "Cybersecurity",
            "Business Administration (MBA)",
            "Masters in Computer Applications (MCA)",
            "B.Tech Final Year",
            "M.Tech Students",
            "PhD Students",
            "Software Engineering",
            "Information Systems",
            "Computer Applications"
        ]
        
        # Add colleges
        for college_name in colleges:
            college = College(
                name=college_name,
                is_approved=True
            )
            db.add(college)
        
        # Add student groups
        for group_name in student_groups:
            group = StudentGroup(
                name=group_name,
                is_approved=True
            )
            db.add(group)
        
        db.commit()
        
    except Exception as e:
        db.rollback()
    finally:
        db.close()
