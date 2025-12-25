import type { APIRoute } from 'astro';
import { addProductToGroup, removeProductFromGroup } from '../../../../lib/db/queries/groups';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const groupId = Number(params.id);
    if (isNaN(groupId)) {
      return new Response(JSON.stringify({ message: 'Invalid group ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return new Response(JSON.stringify({ message: 'Product ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await addProductToGroup(Number(productId), groupId);

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error adding product to group:', error);
    return new Response(JSON.stringify({ message: 'Failed to add product to group' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const groupId = Number(params.id);
    if (isNaN(groupId)) {
      return new Response(JSON.stringify({ message: 'Invalid group ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return new Response(JSON.stringify({ message: 'Product ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await removeProductFromGroup(Number(productId), groupId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error removing product from group:', error);
    return new Response(JSON.stringify({ message: 'Failed to remove product from group' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
