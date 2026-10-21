import { Request, Response, NextFunction } from 'express';
import { Event } from '../models/Event.js';

export async function getPublicEvent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'A valid wedding public token is required.',
      });
      return;
    }

    const event = await Event.findOne({ publicToken: token }).select(
      'title brideName groomName eventDate venue description coverImageUrl publicToken status createdAt'
    );

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'This wedding event page could not be found. Please check your invitation link.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        event: {
          title: event.title,
          brideName: event.brideName,
          groomName: event.groomName,
          eventDate: event.eventDate,
          venue: event.venue,
          description: event.description,
          coverImageUrl: event.coverImageUrl,
          publicToken: event.publicToken,
          status: event.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
