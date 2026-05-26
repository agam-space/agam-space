-- Auto-update updated_at timestamp on UPDATE
-- This ensures updatedAt is always current without manual code updates

-- Create reusable function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
--> statement-breakpoint

-- Apply trigger to files table
DROP TRIGGER IF EXISTS update_files_updated_at ON files;--> statement-breakpoint
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

-- Apply trigger to folders table
DROP TRIGGER IF EXISTS update_folders_updated_at ON folders;--> statement-breakpoint
CREATE TRIGGER update_folders_updated_at
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

-- Apply trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;--> statement-breakpoint
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

-- Apply trigger to user_quota table
DROP TRIGGER IF EXISTS update_user_quota_updated_at ON user_quota;--> statement-breakpoint
CREATE TRIGGER update_user_quota_updated_at
    BEFORE UPDATE ON user_quota
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

-- Apply trigger to public_shares table
DROP TRIGGER IF EXISTS update_public_shares_updated_at ON public_shares;--> statement-breakpoint
CREATE TRIGGER update_public_shares_updated_at
    BEFORE UPDATE ON public_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

-- Apply trigger to user_keys table
DROP TRIGGER IF EXISTS update_user_keys_updated_at ON user_keys;--> statement-breakpoint
CREATE TRIGGER update_user_keys_updated_at
    BEFORE UPDATE ON user_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

