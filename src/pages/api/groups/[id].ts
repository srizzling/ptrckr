import type { APIRoute } from 'astro';
import { getGroupById, updateGroup, deleteGroup } from '../../../lib/db/queries/groups';

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid group ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const group = await getGroupById(id);
    if (!group) {
      return new Response(JSON.stringify({ message: 'Group not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(group), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch group' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid group ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { name, description } = body;

    const group = await updateGroup(id, { name, description });

    return new Response(JSON.stringify(group), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating group:', error);
    return new Response(JSON.stringify({ message: 'Failed to update group' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid group ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await deleteGroup(id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting group:', error);
    return new Response(JSON.stringify({ message: 'Failed to delete group' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
