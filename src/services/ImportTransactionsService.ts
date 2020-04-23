import { getCustomRepository, getRepository, In } from 'typeorm';
import path from 'path';
import fs from 'fs';
import parse from 'csv-parse';

import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';

import uploadConfig from '../config/upload';
import Category from '../models/Category';

interface Request {
  filename: string;
}

interface CsvTransaction {
  title: string;
  value: number;
  type: string;
  category: string;
}

class ImportTransactionsService {
  async execute({ filename }: Request): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);
    const csvPath = path.join(uploadConfig.directory, filename);

    const contactsReadStream = fs.createReadStream(csvPath);

    const parsers = parse({
      from_line: 2,
    });

    const parsedCSV = contactsReadStream.pipe(parsers);

    const transactions: CsvTransaction[] = [];
    const categories: string[] = [];

    parsedCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) {
        return;
      }

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    // Wait for the file to finish reading
    await new Promise(resolve => parsedCSV.on('end', resolve));

    const existingCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existingCategoryTitles = existingCategories.map(
      category => category.title,
    );

    const addCategoryTitles = categories
      .filter(category => !existingCategoryTitles.includes(category))
      .filter((item, index) => categories.indexOf(item) === index);

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({ title })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existingCategories];

    const t: Transaction[] = transactions.map(transaction => {
      return {
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(cat => cat.title === transaction.title),
      };
    });

    const newTransactions = transactionsRepository.create(t);

    await transactionsRepository.save(newTransactions);

    await fs.promises.unlink(csvPath);

    return newTransactions;
  }
}

export default ImportTransactionsService;
