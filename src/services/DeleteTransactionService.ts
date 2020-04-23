import { getCustomRepository } from 'typeorm';

import TransactionsRepository from '../repositories/TransactionsRepository';
import AppError from '../errors/AppError';

class DeleteTransactionService {
  public async execute(id: string): Promise<void> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const transactionFound = await transactionsRepository.findOne(id);

    if (!transactionFound) {
      throw new AppError('This transactions does not exist');
    }

    await transactionsRepository.remove(transactionFound);
  }
}

export default DeleteTransactionService;
