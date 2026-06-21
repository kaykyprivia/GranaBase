export type ProfileRole = "customer" | "admin";

export interface Profile {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  role: ProfileRole;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; name: string; email: string };
        Update: Partial<Profile>;
      };
    };
  };
}
