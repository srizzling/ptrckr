import type { APIRoute } from 'astro';
import { getGroups, createGroup } from '../../../lib/db/queries/groups';

export const GET: APIRoute = async () => {
  try {
    const allGroups = await getGroups();
    return new Response(JSON.stringify(allGroups), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch groups' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return new Response(JSON.stringify({ message: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const group = await createGroup({ name, description: description || null });

    return new Response(JSON.stringify(group), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return new Response(JSON.stringify({ message: 'Failed to create group' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
