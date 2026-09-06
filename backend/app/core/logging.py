import logging
import sys
import json
from datetime import datetime, timezone

class StructuredJsonFormatter(logging.Formatter):
    """Formats log records as JSON for structured telemetry."""
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno
        }
        if hasattr(record, "request_id"):
            log_obj["request_id"] = record.request_id
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)

def setup_logging(json_logs: bool = False) -> logging.Logger:
    """Configures application-wide logging with sensible formatters."""
    logger = logging.getLogger("vending_fleet")
    logger.setLevel(logging.INFO)
    
    # Avoid duplicate handlers
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        if json_logs:
            handler.setFormatter(StructuredJsonFormatter())
        else:
            formatter = logging.Formatter(
                fmt="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S"
            )
            handler.setFormatter(formatter)
        logger.addHandler(handler)
        
    return logger

logger = setup_logging()
