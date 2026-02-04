#!/usr/bin/env python3
"""
Execute the generated admin areas SQL file directly against Supabase.
This script reads the SQL file and executes it in batches to avoid query size limits.
"""

import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("Error: psycopg2 not installed. Install with: pip install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / '.env.local'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"Loaded environment variables from {env_path}")
except ImportError:
    pass


def get_database_url():
    """Get database connection URL from environment"""
    # First, try direct DATABASE_URL
    db_url = os.getenv('DATABASE_URL')
    if db_url:
        return db_url
    
    # Try to get from Supabase URL and service role key
    supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    
    if not supabase_url:
        print("Error: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set")
        print("\nAlternatively, set DATABASE_URL with your full connection string")
        print("You can find it in Supabase Dashboard -> Settings -> Database -> Connection string")
        sys.exit(1)
    
    # Extract project ref from URL (e.g., https://xxxxx.supabase.co -> xxxxx)
    project_ref = supabase_url.replace('https://', '').replace('.supabase.co', '').split('.')[0]
    
    # Get database password
    db_password = os.getenv('SUPABASE_DB_PASSWORD') or os.getenv('DATABASE_PASSWORD')
    
    if not db_password:
        print("Error: SUPABASE_DB_PASSWORD or DATABASE_PASSWORD must be set")
        print("\nYou can find the database password in:")
        print("  Supabase Dashboard -> Settings -> Database -> Database password")
        print("\nOr set DATABASE_URL directly with the full connection string:")
        print("  DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:5432/postgres")
        sys.exit(1)
    
    # Try to get region/host from environment or construct from project ref
    # Supabase connection strings typically use: db.[PROJECT_REF].supabase.co
    db_host = os.getenv('SUPABASE_DB_HOST')
    if not db_host:
        # Try to construct from project ref - use direct connection (port 5432) or pooler (port 6543)
        # First try direct connection
        db_host = f"db.{project_ref}.supabase.co"
        db_port = "5432"
    else:
        db_port = os.getenv('SUPABASE_DB_PORT', '5432')
    
    # Build connection string
    # Try different formats - Supabase uses different formats for direct vs pooler connections
    # Format 1: Direct connection (port 5432) - username is just "postgres"
    # Format 2: Pooler connection (port 6543) - username is "postgres.[PROJECT_REF]"
    
    # First try direct connection with simple postgres user
    db_url = f"postgresql://postgres:{db_password}@{db_host}:5432/postgres"
    
    # If that doesn't work, user should provide DATABASE_URL directly
    # The connection string from Supabase dashboard will have the correct format
    return db_url


def execute_sql_file(sql_file: Path, batch_size: int = 50):
    """Execute SQL file in batches"""
    print(f"Reading SQL file: {sql_file}")
    
    with open(sql_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into individual INSERT statements
    statements = []
    current_statement = []
    
    for line in content.split('\n'):
        line = line.strip()
        if not line or line.startswith('--'):
            continue
        
        current_statement.append(line)
        
        if line.endswith(';'):
            statements.append('\n'.join(current_statement))
            current_statement = []
    
    if current_statement:
        statements.append('\n'.join(current_statement))
    
    print(f"Found {len(statements)} SQL statements")
    
    # Get database connection
    db_url = get_database_url()
    
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        
        print("Executing SQL statements...")
        executed = 0
        errors = 0
        
        for i, statement in enumerate(statements, 1):
            try:
                cur.execute(statement)
                executed += 1
                if i % 10 == 0:
                    print(f"  Executed {i}/{len(statements)} statements...")
            except Exception as e:
                errors += 1
                print(f"  Error executing statement {i}: {e}")
                # Continue with next statement
                continue
        
        cur.close()
        conn.close()
        
        print(f"\nComplete! Executed: {executed}, Errors: {errors}")
        
    except Exception as e:
        print(f"Error connecting to database: {e}")
        print("\nAlternative: Use Supabase CLI:")
        print(f"  supabase db execute -f {sql_file}")
        print("\nOr use psql:")
        print(f"  psql $DATABASE_URL -f {sql_file}")
        sys.exit(1)


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    sql_file = project_root / 'out' / 'import_admin_areas_generated.sql'
    
    if not sql_file.exists():
        print(f"Error: SQL file not found at {sql_file}")
        print("Run import_osm_data.py first to generate it")
        sys.exit(1)
    
    execute_sql_file(sql_file)


if __name__ == '__main__':
    main()
