import { supabase } from "./supabase.js";

export async function getMyProfile() {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
}

export async function updateMyProfile(updates) {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error("Not signed in.");

  const allowedFields = {
    username: updates.username,
    display_name: updates.display_name,
    bio: updates.bio,
    avatar_url: updates.avatar_url
  };

  const cleanUpdates = Object.fromEntries(
    Object.entries(allowedFields)
      .filter(([, value]) => value !== undefined)
  );

  const { data, error } = await supabase
    .from("profiles")
    .update(cleanUpdates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;

  return data;
}
