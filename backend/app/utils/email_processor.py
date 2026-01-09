import re
from datetime import datetime
from typing import Dict, Any

# Template variables that companies can use
TEMPLATE_VARIABLES = {
    'student_name': 'Student full name',
    'student_email': 'Student email address',
    'roll_number': 'Student roll number',
    'access_token': 'Student access token for login',
    'drive_title': 'Recruitment drive title',
    'company_name': 'Company name',
    'password': 'Auto-generated login password (deprecated - use access_token)',
    'login_url': 'Student login URL',
    'start_time': 'Exam start date and time',
    'duration': 'Exam duration in minutes'
}

class EmailTemplateProcessor:
    """Process email templates with variable substitution"""

    @staticmethod
    def render_template(template: str, variables: Dict[str, Any]) -> str:
        """Replace template variables with actual values"""
        def replace_var(match):
            var_name = match.group(1)
            value = variables.get(var_name, "")  # Replace unknown variables with empty string
            return str(value)

        return re.sub(r'\{\{(\w+)\}\}', replace_var, template)

    @staticmethod
    def get_sample_data() -> Dict[str, str]:
        """Sample data for template preview"""
        return {
            'student_name': 'John Doe',
            'student_email': 'john.doe@example.com',
            'roll_number': 'CS001',
            'access_token': '12345678-abcd-1234-efgh-1234567890ab',
            'drive_title': 'Software Engineer Position',
            'company_name': 'TechCorp Solutions',
            'password': 'SoftwareEngineer2024',
            'login_url': 'http://localhost:5174',
            'start_time': 'December 15, 2024 at 10:00 AM',
            'duration': '90'
        }

    @staticmethod
    def validate_template(template: str) -> Dict[str, Any]:
        """Validate template syntax and variables"""
        variables_used = re.findall(r'\{\{(\w+)\}\}', template)
        valid_variables = set(TEMPLATE_VARIABLES.keys())
        invalid_variables = set(variables_used) - valid_variables

        return {
            'is_valid': len(invalid_variables) == 0,
            'invalid_variables': list(invalid_variables),
            'variables_used': variables_used,
            'valid_variables': list(valid_variables)
        }

    @staticmethod
    def generate_password(drive_title: str) -> str:
        """Generate password from drive title"""
        # Remove spaces and special characters, keep alphanumeric
        clean_title = re.sub(r'[^a-zA-Z0-9]', '', drive_title)
        return clean_title[:20] if clean_title else 'DefaultPassword123'

    @staticmethod
    def format_datetime(dt) -> str:
        """Format datetime for email display in UTC
        
        IMPORTANT: SQLAlchemy returns naive datetime objects from DB,
        but they represent UTC time. We format them directly without conversion.
        """
        if dt is None:
            return 'TBD'
        
        from datetime import datetime
        
        if isinstance(dt, str):
            # If string, parse it
            try:
                dt_obj = datetime.fromisoformat(dt.replace('Z', '+00:00'))
                # Remove timezone info to get naive datetime (which represents UTC)
                dt = dt_obj.replace(tzinfo=None)
            except:
                return dt
        
        # At this point, dt is a naive datetime object representing UTC time
        # Format it directly - strftime on naive datetime just formats the numbers
        # Since the datetime represents UTC, the formatted string is also UTC
        return dt.strftime('%B %d, %Y at %H:%M UTC')

    @staticmethod
    def prepare_email_variables(student, drive, company) -> Dict[str, str]:
        """Prepare variables for a specific student and drive"""
        return {
            'student_name': student.name or student.roll_number or "Student",
            'student_email': student.email,
            'roll_number': student.roll_number or "N/A",
            'access_token': student.access_token,
            'drive_title': drive.title,
            'company_name': company.company_name,
            'password': EmailTemplateProcessor.generate_password(drive.title),
            'login_url': 'http://localhost:5174',  # Student portal URL
            'start_time': EmailTemplateProcessor.format_datetime(drive.window_start),
            'duration': str(drive.exam_duration_minutes or 60)
        }
